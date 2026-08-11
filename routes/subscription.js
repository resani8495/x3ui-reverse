const express = require('express');
const Client = require('../models/Client');
const ProtocolService = require('../services/protocols');

const router = express.Router();

// Subscription endpoint (no auth required - uses unique URL)
router.get('/:subUrl', (req, res) => {
  try {
    const client = Client.getBySubscription(req.params.subUrl);
    
    if (!client) {
      return res.status(404).send('Subscription not found');
    }

    if (!client.enabled) {
      return res.status(403).send('Subscription disabled');
    }

    // Check expiry
    if (client.expire_date && new Date(client.expire_date) < new Date()) {
      return res.status(403).send('Subscription expired');
    }

    // Check traffic
    if (client.traffic_limit > 0 && client.traffic_used >= client.traffic_limit) {
      return res.status(403).send('Traffic limit exceeded');
    }

    const link = ProtocolService.generateLink(client);
    const encoded = Buffer.from(link).toString('base64');

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${client.name}.txt"`,
      'Profile-Title': Buffer.from(client.name).toString('base64'),
      'Subscription-Userinfo': `upload=${client.traffic_up}; download=${client.traffic_down}; total=${client.traffic_limit}; expire=${client.expire_date ? Math.floor(new Date(client.expire_date).getTime() / 1000) : 0}`,
      'Profile-Update-Interval': '12',
      'Support-URL': 'https://t.me/support'
    });

    res.send(encoded);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;
