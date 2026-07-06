import { Command } from '../../interfaces/Command';
import { SlashCommandBuilder, ChatInputCommandInteraction, Message, PermissionFlagsBits } from 'discord.js';
import { UserLevel } from '../../models/UserLevel';

export const data = new SlashCommandBuilder()
    .setName('setlevel')
    .setDescription('Set a user\'s level')
    .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
    .addIntegerOption(opt => opt.setName('level').setDescription('The level to set').setRequired(true).setMinValue(0));

export const command: Command = {
    name: 'setlevel',
    enabled: true,
    aliases: ['set-level'],
    async execute(interaction: ChatInputCommandInteraction | Message, args: string[], _client: any) {
        try {
            if (!interaction.guild) return;

            const member = interaction instanceof ChatInputCommandInteraction
                ? await interaction.guild.members.fetch(interaction.user.id)
                : (interaction as Message).member;

            if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
                const msg = '❌ ليس لديك صلاحية لاستخدام هذا الأمر.';
                if (interaction instanceof ChatInputCommandInteraction) return interaction.reply({ content: msg, ephemeral: true });
                return (interaction as Message).reply(msg);
            }

            let targetId: string;
            let level: number;

            if (interaction instanceof ChatInputCommandInteraction) {
                targetId = interaction.options.getUser('user', true).id;
                level = interaction.options.getInteger('level', true);
            } else {
                const msg = interaction as Message;
                const mentioned = msg.mentions.users.first();
                if (!mentioned || isNaN(parseInt(args[1]))) return msg.reply('الاستخدام: `setlevel @user <level>`');
                targetId = mentioned.id;
                level = parseInt(args[1]);
            }

            await UserLevel.findOneAndUpdate(
                { guildId: interaction.guild.id, userId: targetId },
                { level, xp: 0, totalXP: level * 250 },
                { upsert: true }
            );

            const msg = `✅ تم تعيين مستوى <@${targetId}> إلى **${level}**.`;
            if (interaction instanceof ChatInputCommandInteraction) return interaction.reply({ content: msg });
            return (interaction as Message).reply(msg);
        } catch (err) {
            console.error('setlevel error:', err);
        }
    }
};
