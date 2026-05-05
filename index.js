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
  console.log('[CIBICOM] Uplink received:', JSON.stringify(body));

  // Decode hex payload
  const hexData = body.data || '';
  const decoded = Buffer.from(hexData, 'hex').toString('ascii');
  console.log('[CIBICOM] Decoded payload:', decoded);

  // Build MQTT message
  const message = JSON.stringify({
    status:  decoded,          // "PET_MISSING" or "PET_RETURNED"
    rssi:    body.rssi  || 0,
    snr:     body.snr   || 0,
    devEUI:  body.EUI   || '',
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