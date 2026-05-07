const express = require('express');
const mqtt    = require('mqtt');

const app = express();
app.use(express.json());

// HiveMQ connection
const mqttClient = mqtt.connect(
  'mqtts://14cae6d240b2426398a24b5f85cda552.s1.eu.hivemq.cloud:8883',
  {
    username: 'group7',
    password: 'Groupgroup7',
    rejectUnauthorized: true
  }
);

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected to HiveMQ');
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] Error:', err.message);
});

// Cibicom sends POST to this endpoint
app.post('/lorawan', (req, res) => {
  const body = req.body;

  // only process cmd:gw (ignore cmd:rx and others)
  if (body.cmd !== 'gw') {
    console.log('[CIBICOM] Skipping cmd:', body.cmd);
    return res.status(200).send('OK');
  }

  // Decode hex payload
  const hexData = body.data || '';
  const decoded = Buffer.from(hexData, 'hex').toString('ascii');
  console.log('[CIBICOM] Decoded payload:', decoded);

  // Solo publicar si es un mensaje conocido del collar
  if (decoded !== 'PET_MISSING' && decoded !== 'PET_RETURNED') {
    console.log('[CIBICOM] Skipping unknown payload:', decoded);
    return res.status(200).send('OK');
  }

  // Take the best gateway (the one with the highest RSSI = closest to the dog)
  const gws = body.gws || [];
  const bestGw = gws.reduce((best, gw) =>
    (gw.rssi > (best.rssi || -999)) ? gw : best, {});

  // Build MQTT message
  const message = JSON.stringify({
    status:  decoded,
    devEUI:  body.EUI    || '',
    rssi:    bestGw.rssi || 0,
    snr:     bestGw.snr  || 0,
    gw_lat:  bestGw.lat  || 0,
    gw_lon:  bestGw.lon  || 0,
    time:    new Date().toISOString()
  });

  mqttClient.publish('iot/group7/lorawan/status', message, (err) => {
    if (err) console.error('[MQTT] Publish error:', err);
    else console.log('[MQTT] Published:', message);
  });

  res.status(200).send('OK');
});

app.get('/', (req, res) => res.send('Bridge running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bridge listening on port ${PORT}`));