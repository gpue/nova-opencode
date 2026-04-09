/**
 * Service Registry Publisher for Nova OpenCode
 *
 * Standalone script that registers nova-opencode in the NATS KV registry_services
 * bucket for discovery by the NovaHeader Cmd+K launcher.
 *
 * Run alongside the other nova-opencode processes.
 */

import { connect, StringCodec } from "nats";

const NATS_URL =
  process.env.NATS_BROKER || process.env.NATS_URL || "nats://localhost:4222";
const REGISTRY_SERVICES_BUCKET =
  process.env.REGISTRY_SERVICES_BUCKET || "registry_services";
const SERVICE_KV_TTL_S = parseInt(process.env.SERVICE_KV_TTL_S || "60", 10);
const REGISTRY_HEARTBEAT_S = parseInt(
  process.env.REGISTRY_HEARTBEAT_S || "15",
  10
);

const SERVICE_CONFIG = {
  id: "nova-opencode",
  name: "Nova OpenCode",
  description: "AI coding assistant",
  href: "/cell/nova-opencode/",
  iconUrl: "/cell/nova-opencode/app_icon.svg",
  group: "Services",
};

let nc = null;
let kv = null;
let heartbeatInterval = null;
let running = true;

const sc = StringCodec();

async function publishEntry(online) {
  if (!kv) return;

  const entry = {
    id: SERVICE_CONFIG.id,
    name: SERVICE_CONFIG.name,
    description: SERVICE_CONFIG.description,
    href: SERVICE_CONFIG.href,
    icon_url: SERVICE_CONFIG.iconUrl,
    group: SERVICE_CONFIG.group,
    source: SERVICE_CONFIG.id,
    online,
    last_seen: new Date().toISOString(),
  };

  try {
    await kv.put(SERVICE_CONFIG.id, sc.encode(JSON.stringify(entry)));
  } catch (err) {
    console.warn(`[service-registry] Failed to publish entry: ${err.message}`);
  }
}

async function start() {
  try {
    nc = await connect({
      servers: NATS_URL,
      maxReconnectAttempts: 3,
    });
    console.log(`[service-registry] Connected to NATS at ${NATS_URL}`);

    const js = nc.jetstream();

    try {
      kv = await js.views.kv(REGISTRY_SERVICES_BUCKET, {
        ttl: SERVICE_KV_TTL_S * 1000,
      });
    } catch (err) {
      kv = await js.views.kv(REGISTRY_SERVICES_BUCKET);
    }

    console.log(
      `[service-registry] Using KV bucket: ${REGISTRY_SERVICES_BUCKET}`
    );

    await publishEntry(true);
    console.log(`[service-registry] Registered service: ${SERVICE_CONFIG.id}`);

    heartbeatInterval = setInterval(async () => {
      if (running) {
        await publishEntry(true);
      }
    }, REGISTRY_HEARTBEAT_S * 1000);

    // Keep process alive and handle shutdown
    const shutdown = async () => {
      console.log("[service-registry] Shutting down...");
      running = false;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (kv) await publishEntry(false);
      if (nc) await nc.close();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // Keep alive
    await new Promise(() => {});
  } catch (err) {
    console.warn(
      `[service-registry] Failed to start: ${err.message}. Service registry disabled.`
    );
    // Don't exit - just log and continue without registration
    await new Promise(() => {});
  }
}

start();
