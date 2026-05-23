# ReallySmartHouse Bridge

A lightweight Node.js service that acts as a middleware between the Cibicom LoRaWAN network and HiveMQ Cloud. Part of the [ReallySmartHouse](https://github.com/JAVIERTEL/ReallySmartHouse) project.

## Context

The ReallySmartHouse system uses BLE as the primary channel to track the pet collar. The ESP32 gateway scans for the collar periodically; as long as BLE is available, no LoRaWAN traffic is generated.

When the collar moves out of BLE range, it automatically falls back to LoRaWAN using an on-board RN2483 module. It joins the Cibicom network via OTAA and starts transmitting `PET_MISSING` uplinks. Once BLE is restored, it transmits `PET_RETURNED` before switching back.

The problem is that Cibicom speaks HTTP and the dashboard speaks MQTT. This bridge solves that mismatch — it is the only component that knows about both protocols.

## How It Works

```
Pet collar (LoRaWAN)
       │
       ▼
   Cibicom network
       │  HTTP POST (every uplink)
       ▼
  Bridge on Railway  ◄── this service
       │  MQTT over TLS
       ▼
  HiveMQ Cloud
       │  WebSockets
       ▼
   Dashboard
```

When Cibicom receives a LoRaWAN uplink from the collar, it forwards it as an HTTP POST to the `/lorawan` endpoint on this service. The bridge then:

1. **Filters by message type.** Cibicom sends several types of messages per uplink — `cmd:gw` (antenna metadata + payload) and `cmd:rx` (raw radio event), among others. Only `cmd:gw` contains the actual payload and gateway coordinates, so everything else is discarded immediately.

2. **Decodes the payload.** The RN2483 transmits ASCII strings encoded as hex. For example, `5045545F4D495353494E47` decodes to `PET_MISSING`. The bridge converts the hex back to ASCII and rejects any message that is not exactly `PET_MISSING` or `PET_RETURNED`, preventing garbage data from reaching the dashboard.

3. **Selects the best gateway.** A single LoRaWAN uplink is typically received by multiple Cibicom antennas. The `gws[]` array in the POST body lists all of them with their RSSI and coordinates. The bridge picks the one with the highest RSSI — the antenna physically closest to the dog — and uses its coordinates as the location estimate.

4. **Publishes to HiveMQ.** A structured JSON message is published to `iot/group7/lorawan/status` over MQTT/TLS. The dashboard subscribes to this topic and displays the alert in real time.

## MQTT Output

Topic: `iot/group7/lorawan/status`

```json
{
  "status":  "PET_MISSING",
  "devEUI":  "0004A30B01060D5E",
  "rssi":    -85,
  "snr":     4,
  "gw_lat":  55.7877781,
  "gw_lon":  12.5198771,
  "time":    "2026-05-20T07:21:26.244Z"
}
```

| Field | Description |
|---|---|
| `status` | `PET_MISSING` or `PET_RETURNED` |
| `devEUI` | LoRaWAN device identifier of the collar |
| `rssi` | Signal strength at the best antenna (dBm) |
| `snr` | Signal-to-noise ratio at the best antenna (dB) |
| `gw_lat` / `gw_lon` | Coordinates of the closest Cibicom antenna |
| `time` | ISO 8601 timestamp of the uplink |

## Requirements

- Node.js 18+
- A Cibicom account with the device registered and the HTTP integration pointing to this service
- A HiveMQ Cloud cluster

## Configuration

The following values are hardcoded in `index.js`. If you fork this repository, update them before deploying:

| Setting | Description |
|---|---|
| HiveMQ host | Your HiveMQ Cloud cluster URL |
| `username` / `password` | HiveMQ credentials |
| MQTT topic | `iot/group7/lorawan/status` |

## Deploy on Railway

1. Fork or clone this repository.
2. Create a new project on [Railway](https://railway.app) and connect this repo.
3. Railway detects `package.json` and runs `npm start` automatically.
4. Copy the public URL Railway assigns and paste it into the Cibicom HTTP integration as the uplink endpoint:
   ```
   https://<your-app>.railway.app/lorawan
   ```

## Run Locally

```bash
git clone https://github.com/JAVIERTEL/ReallySmartHouse_Bridge.git
cd ReallySmartHouse_Bridge
npm install
node index.js
```

The server listens on port `3000` by default. Use [ngrok](https://ngrok.com) to expose it to Cibicom during local testing.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/lorawan` | Cibicom uplink receiver |
| `GET` | `/` | Health check — returns `Bridge running` |

## Related

- [ReallySmartHouse firmware](https://github.com/JAVIERTEL/ReallySmartHouse) — ESP32 nodes and gateway
- [ReallySmartHouse Dashboard](https://jackvisi.github.io/reallysmarthousedash/) — live web dashboard
