const router = require('express').Router();
const Contest = require('../models/Contest');
const config = require('../config');
const { asyncHandler, send } = require('../utils/http');

router.get('/info', (req, res) => send(res, { appName: config.appName, serverNow: Date.now() }));

// SEB config download. Candidates open sebs://<host>/api/public/seb/<slug>.seb to launch SEB directly.
router.get(
  '/seb/:file',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.file).replace(/\.seb$/i, '').toLowerCase();
    const c = await Contest.findOne({ slug, published: true }).select('+sebConfigFile sebConfigFileName').lean();
    if (!c?.sebConfigFile) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'application/seb');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.seb"`);
    res.send(Buffer.from(c.sebConfigFile.buffer || c.sebConfigFile));
  })
);

module.exports = router;
