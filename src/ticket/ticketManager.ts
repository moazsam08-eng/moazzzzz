import { 
    TextChannel, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ButtonInteraction,
    ChannelType,
    GuildMember,
    StringSelectMenuInteraction
} from 'discord.js';
import { ModBot } from '../types/ModBot';
import { Ticket } from '../models/Ticket';
import { createTranscript } from './transcriptGenerator';
import { TicketSection } from '../types/TicketSection';

interface TicketData {
    id: string;
    guildId: string;
    channelId: string;
    userId: string;
    section: string;
    status: 'open' | 'claimed' | 'closed';
    claimedBy?: string;
    claimedAt?: Date;
    closedBy?: string;
    closedAt?: Date;
    createdAt: Date;
}

export class TicketManager {
    constructor(private client: ModBot) {}

    public async setupSystem(channel: TextChannel): Promise<void> {
        try {
            const settings = this.client.settings.ticket;
            const locale = this.client.locales.get(this.client.settings.defaultLanguage)?.ticket;

            if (!settings.enabled) {
                throw new Error(locale?.messages?.disabled || 'Ticket system is disabled');
            }

            const embed = this.createSetupEmbed();
            const components = this.createTicketComponents();

            await channel.send({
                embeds: [embed],
                components
            });

        } catch (error) {
            console.error('Error setting up ticket system:', error);
            throw error;
        }
    }

    private createSetupEmbed(): EmbedBuilder {
        const settings = this.client.settings.ticket;
        const locale = this.client.locales.get(this.client.settings.defaultLanguage)?.ticket;

        const embed = new EmbedBuilder()
            .setTitle(locale?.embeds?.setup?.title || 'Ticket System')
            .setDescription(locale?.embeds?.setup?.description || 'Click below to create a ticket')
            .setColor(settings.embed.color as `#${string}`)
            .setTimestamp();

        if (settings.embed.thumbnail) {
            const thumbnail = settings.embed.thumbnail === '' ? null : settings.embed.thumbnail;
            embed.setThumbnail(thumbnail);
        }

        if (settings.embed.image) {
            const image = settings.embed.image === '' ? null : settings.embed.image;
            embed.setImage(image);
        }

        if (settings.embed.footer) {
            const footerIcon = settings.embed.footerIcon === '' ? null : settings.embed.footerIcon;
            
            embed.setFooter({
                text: settings.embed.footer,
                iconURL: footerIcon
            });
        }

        return embed;
    }

    private createTicketComponents(): ActionRowBuilder<ButtonBuilder>[] {
        const settings = this.client.settings.ticket;

        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        let currentRow = new ActionRowBuilder<ButtonBuilder>();
        let buttonCount = 0;
        const rowLimit = 5; // Maximum buttons per row

        settings.sections
            .filter((section: TicketSection) => section.enabled)
            .forEach((section: TicketSection) => {
                if (buttonCount >= rowLimit) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder<ButtonBuilder>();
                    buttonCount = 0;
                }

                currentRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_create_${section.name.toLowerCase().replace(/\s+/g, '_')}`)
                        .setLabel(section.name)
                        .setEmoji(section.emoji)
                        .setStyle(ButtonStyle.Primary)
                );

                buttonCount++;
            });

        if (buttonCount > 0) {
            rows.push(currentRow);
        }

        return rows;
    }

    public async handleInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
        const locale = this.client.locales.get(this.client.settings.defaultLanguage)?.ticket;
        
        try {
            const settings = this.client.settings.ticket;

            if (!interaction.isButton()) {
                return;
            }

            const sectionName = interaction.customId.replace('ticket_create_', '');

            const section = settings.sections.find((s: TicketSection) => 
                s.name.toLowerCase().replace(/\s+/g, '_') === sectionName
            );

            if (!section || !section.enabled) {
                await interaction.reply({
                    content: locale?.messages?.invalidSection || '❌ Invalid ticket section',
                    ephemeral: true
                });
                return;
            }

            // Check required server membership
            const requiredServer = settings.requiredServer;
            if (requiredServer?.enabled && requiredServer?.guildId) {
                const msg = requiredServer.message || '❌ يجب عليك الانضمام إلى سيرفرنا أولاً حتى تتمكن من فتح تذكرة!';
                const inviteUrl = requiredServer.inviteUrl || '';
                const replyMsg = inviteUrl ? `${msg}\n\n🔗 **رابط السيرفر:** ${inviteUrl}` : msg;

                try {
                    const requiredGuild = await this.client.guilds.fetch(requiredServer.guildId);
                    await requiredGuild.members.fetch({ user: interaction.user.id, force: true });
                    // If fetch succeeded, user is a member — allow ticket
                } catch {
                    // User is not a member OR bot is not in required guild — block either way
                    await interaction.reply({ content: replyMsg, ephemeral: true });
                    return;
                }
            }

            const existingTickets = await Ticket.find({
                guildId: interaction.guildId,
                userId: interaction.user.id,
                status: { $in: ['open', 'claimed'] }
            });

            // Close any tickets whose channel was manually deleted
            for (const t of existingTickets) {
                const ch = interaction.guild?.channels.cache.get(t.channelId) || 
                           await interaction.guild?.channels.fetch(t.channelId).catch(() => null);
                if (!ch) {
                    t.status = 'closed';
                    t.closedBy = 'system';
                    t.closedAt = new Date();
                    await t.save();
                }
            }

            const activeTickets = existingTickets.filter(t => t.status !== 'closed');
            if (activeTickets.length > 0) {
                await interaction.reply({
                    content: locale?.messages?.existingTicket || '❌ You already have an open ticket',
                    ephemeral: true
                });
                return;
            }

            const category = await interaction.guild?.channels.fetch(section.categoryId);
            if (!category || category.type !== ChannelType.GuildCategory) {
                throw new Error('Invalid category');
            }

            const channelName = `ticket-${interaction.user.username.toLowerCase()}`;
            const ticketChannel = await interaction.guild?.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: ['ViewChannel']
                    },
                    {
                        id: interaction.user.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                    },
                    {
                        id: this.client.user!.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels']
                    },
                    ...section.adminRoles.map((roleId: string) => ({
                        id: roleId,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                    }))
                ]
            });

            if (!ticketChannel) {
                throw new Error('Failed to create ticket channel');
            }

            const ticket = await Ticket.create({
                guildId: interaction.guildId,
                channelId: ticketChannel.id,
                userId: interaction.user.id,
                section: section.name,
                status: 'open'
            });

            const embed = this.createTicketEmbed(ticket, interaction.member as GuildMember);

            const buttons = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_claim_${ticket.id}`)
                        .setLabel(locale?.buttons?.claim || 'Claim')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('👋'),
                    new ButtonBuilder()
                        .setCustomId(`ticket_close_${ticket.id}`)
                        .setLabel(locale?.buttons?.close || 'Close')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );

            await ticketChannel.send({
                content: `<@${interaction.user.id}> ${locale?.messages?.welcome || 'Welcome to your ticket!'}`,
                embeds: [embed],
                components: [buttons]
            });

            await interaction.reply({
                content: locale?.messages?.created?.replace('{channel}', `<#${ticketChannel.id}>`) || 
                         `✅ Ticket created: <#${ticketChannel.id}>`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error creating ticket:', error);
            await interaction.reply({
                content: locale?.messages?.error?.create || '❌ An error occurred while creating your ticket.',
                ephemeral: true
            });
        }
    }

    private createTicketEmbed(ticket: TicketData, member: GuildMember): EmbedBuilder {
        const settings = this.client.settings.ticket;
        const locale = this.client.locales.get(this.client.settings.defaultLanguage)?.ticket;
        const section = settings.sections.find((s: TicketSection) => s.name === ticket.section);

        const embed = new EmbedBuilder()
            .setColor(settings.embed.color as `#${string}`)
            .setAuthor({
                name: member.user.tag,
                iconURL: member.user.displayAvatarURL()
            })
            .addFields([
                {
                    name: locale?.embeds?.ticket?.user || '👤 User',
                    value: `<@${member.id}>`,
                    inline: true
                },
                {
                    name: locale?.embeds?.ticket?.created || '📅 Created',
                    value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                    inline: true
                },
                {
                    name: locale?.embeds?.ticket?.section || '🏷️ Section',
                    value: `${section?.emoji} ${section?.name}`,
                    inline: true
                }
            ])
            .setTimestamp();

        if (section.imageUrl) {
            const imageUrl = section.imageUrl === '' ? null : section.imageUrl;
            embed.setImage(imageUrl);
        }

        if (settings.embed.thumbnail) {
            const thumbnail = settings.embed.thumbnail === '' ? null : settings.embed.thumbnail;
            embed.setThumbnail(thumbnail);
        }

        if (settings.embed.footer) {
            const footerIcon = settings.embed.footerIcon === '' ? null : settings.embed.footerIcon;
            
            embed.setFooter({
                text: settings.embed.footer,
                iconURL: footerIcon
            });
        }

        return embed;
    }

    public async handleClaim(interaction: ButtonInteraction): Promise<void> {
        try {
            const ticketId = interaction.customId.replace('ticket_claim_', '');
            const ticket = await Ticket.findById(ticketId);
            const locale = this.client.locales.get(this.client.settings.defaultLanguage)?.ticket;

            if (!ticket || ticket.status !== 'open') {
                await interaction.reply({
                    content: locale?.messages?.invalidTicket || '❌ Invalid ticket',
                    ephemeral: true
                });
                return;
            }

            const section = this.client.settings.ticket.sections.find(
                (s: TicketSection) => s.name === ticket.section
            );

            if (!section) {
                await interaction.reply({
                    content: locale?.messages?.invalidSection || '❌ Invalid ticket section',
                    ephemeral: true
                });
                return;
            }

            const member = interaction.member as GuildMember;
            const hasPermission = section.adminRoles.some((roleId: string) => member.roles.cache.has(roleId));

            if (!hasPermission) {
                await interaction.reply({
                    content: locale?.messages?.noPermission || '❌ You do not have permission to claim this ticket',
                    ephemeral: true
                });
                return;
            }

            ticket.status = 'claimed';
            ticket.claimedBy = interaction.user.id;
            ticket.claimedAt = new Date();
            await ticket.save();

            const embed = this.createTicketEmbed(ticket, member);

            const closeButton = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_close_${ticket.id}`)
                        .setLabel(locale?.buttons?.close || 'Close')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );

            await interaction.message.edit({
                embeds: [embed],
                components: [closeButton]
            });

            await interaction.reply({
                content: locale?.messages?.claimed?.replace('{user}', `<@${interaction.user.id}>`) || 
                         `✅ Ticket claimed by <@${interaction.user.id}>`,
            });

        } catch (error) {
            console.error('Error claiming ticket:', error);
            await interaction.reply({
                content: '❌ An error occurred while claiming the ticket.',
                ephemeral: true
            });
        }
    }

    public async handleClose(interaction: ButtonInteraction): Promise<void> {
        try {
            const ticketId = interaction.customId.replace('ticket_close_', '');
            const ticket = await Ticket.findById(ticketId);
            const locale = this.client.locales.get(this.client.settings.defaultLanguage)?.ticket;

            if (!ticket || ticket.status === 'closed') {
                await interaction.reply({
                    content: locale?.messages?.invalidTicket || '❌ Invalid ticket',
                    ephemeral: true
                });
                return;
            }

            const section = this.client.settings.ticket.sections.find(
                (s: TicketSection) => s.name === ticket.section
            );

            if (!section) {
                await interaction.reply({
                    content: locale?.messages?.invalidSection || '❌ Invalid ticket section',
                    ephemeral: true
                });
                return;
            }

            const member = interaction.member as GuildMember;
            const hasPermission = section.adminRoles.some((roleId: string) => member.roles.cache.has(roleId)) || 
                                ticket.userId === member.id;

            if (!hasPermission) {
                await interaction.reply({
                    content: locale?.messages?.noPermission || '❌ You do not have permission to close this ticket',
                    ephemeral: true
                });
                return;
            }

            const channel = await interaction.guild?.channels.fetch(ticket.channelId) as TextChannel;
            if (!channel) {
                throw new Error('Ticket channel not found');
            }

            await interaction.deferReply();

            const transcript = await createTranscript(channel);
            const logChannel = await interaction.guild?.channels.fetch(section.logChannelId) as TextChannel;

            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(locale?.embeds?.log?.title || 'Ticket Closed')
                    .setColor(this.client.settings.ticket.embed.color as `#${string}`)
                    .addFields([
                        {
                            name: locale?.embeds?.log?.ticket || 'Ticket',
                            value: `#${channel.name}`,
                            inline: true
                        },
                        {
                            name: locale?.embeds?.log?.user || 'User',
                            value: `<@${ticket.userId}>`,
                            inline: true
                        },
                        {
                            name: locale?.embeds?.log?.section || 'Section',
                            value: section.name,
                            inline: true
                        },
                        {
                            name: locale?.embeds?.log?.closedBy || 'Closed By',
                            value: `<@${interaction.user.id}>`,
                            inline: true
                        },
                        {
                            name: locale?.embeds?.log?.createdAt || 'Created At',
                            value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`,
                            inline: true
                        },
                        {
                            name: locale?.embeds?.log?.closedAt || 'Closed At',
                            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                            inline: true
                        }
                    ]);

                if (ticket.claimedBy) {
                    logEmbed.addFields({
                        name: locale?.embeds?.log?.claimedBy || 'Claimed By',
                        value: `<@${ticket.claimedBy}>`,
                        inline: true
                    });
                }

                await logChannel.send({
                    embeds: [logEmbed],
                    files: [transcript]
                });
            }

            ticket.status = 'closed';
            ticket.closedBy = interaction.user.id;
            ticket.closedAt = new Date();
            await ticket.save();

            const closeEmbed = new EmbedBuilder()
                .setDescription(locale?.messages?.closing || '🔒 This ticket will be closed in 5 seconds...')
                .setColor(this.client.settings.ticket.embed.color as `#${string}`);

            await interaction.editReply({
                embeds: [closeEmbed]
            });

            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            await interaction.reply({
                content: '❌ An error occurred while closing the ticket.',
                ephemeral: true
            }).catch(() => null);
        }
    }
} 
