import { Router, Request, Response } from 'express';
import { TicketConfig } from '../../src/models/TicketConfig';
import { Ticket }       from '../../src/models/Ticket';

const router = Router();

router.get('/:guildId/tickets', async (req: Request, res: Response) => {
  try {
    const { guildId } = req.params;
    const [config, tickets, total, open, closed] = await Promise.all([
      TicketConfig.findOne({ guildId }),
      Ticket.find({ guildId }).sort({ createdAt: -1 }).limit(50),
      Ticket.countDocuments({ guildId }),
      Ticket.countDocuments({ guildId, status: 'open' }),
      Ticket.countDocuments({ guildId, status: 'closed' }),
    ]);
    res.render('tickets', { config, tickets, stats: { total, open, closed }, guildId });
  } catch (err) {
    console.error('[tickets route]', err);
    res.status(500).send('Server Error');
  }
});

export default router;
