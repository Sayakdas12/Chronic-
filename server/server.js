// ChronicAI high-availability entry point.
// The primary process supervises two identical workers running firebase.js.

import cluster from "node:cluster";
import net from "node:net";
import os from "node:os";
import { pathToFileURL } from "node:url";

export async function getAvailablePort(preferredPort, host = "0.0.0.0") {
	for (let candidate = Number(preferredPort) || 3000; candidate < (Number(preferredPort) || 3000) + 25; candidate += 1) {
		const isFree = await new Promise((resolve) => {
			const tester = net.createServer();
			tester.once("error", () => resolve(false));
			tester.once("listening", () => {
				tester.close(() => resolve(true));
			});
			tester.listen(candidate, host);
		});

		if (isFree) return candidate;
	}

	return Number(preferredPort) || 3000;
}

const preferredPort = Number(process.env.PORT) || 3000;
const port = await getAvailablePort(preferredPort);
const workerCount = Math.max(2, Number(process.env.HA_WORKERS) || 2);
const heartbeatIntervalMs = Math.max(1000, Number(process.env.HA_HEARTBEAT_MS) || 2000);
const heartbeatTimeoutMs = Math.max(heartbeatIntervalMs * 2, Number(process.env.HA_HEARTBEAT_TIMEOUT_MS) || 7000);
const maxRssMb = Math.max(128, Number(process.env.HA_MAX_RSS_MB) || 768);

if (import.meta.url === pathToFileURL(process.argv[1]).href && cluster.isPrimary) {
	cluster.schedulingPolicy = cluster.SCHED_RR;
	const workers = new Map();
	let restartTimer;

	function log(message, details = "") {
		console.log(`[HA ${new Date().toISOString()}] ${message}${details ? ` ${details}` : ""}`);
	}

	function startWorker(index = 0) {
		const worker = cluster.fork({
			CHRONICAI_WORKER: "true",
			CHRONICAI_LISTEN: index === 0 ? "true" : "false",
			PORT: String(port)
		});
		workers.set(worker.id, { worker, lastHeartbeat: Date.now(), ready: false });
		worker.on("message", (message) => {
			const state = workers.get(worker.id);
			if (!state || message?.type !== "health") return;
			state.lastHeartbeat = Date.now();
			state.ready = true;
			state.health = message;
		});
		log(`Worker ${worker.id} started`, `pid=${worker.process.pid} listen=${index === 0 ? "enabled" : "disabled"}`);
	}

	function scheduleWorkerStart() {
		if (restartTimer) return;
		restartTimer = setTimeout(() => {
			restartTimer = undefined;
			if (Object.keys(cluster.workers).length < workerCount) startWorker();
		}, 500);
	}

	for (let index = 0; index < workerCount; index += 1) startWorker(index);

	setInterval(() => {
		const now = Date.now();
		for (const state of workers.values()) {
			if (!state.worker.isConnected()) continue;
			if (now - state.lastHeartbeat > heartbeatTimeoutMs) {
				log(`Worker ${state.worker.id} missed health checks`, `pid=${state.worker.process.pid}`);
				state.worker.kill();
				continue;
			}
			const rssMb = Number(state.health?.rssMb) || 0;
			if (rssMb > maxRssMb) {
				log(`Worker ${state.worker.id} exceeded memory limit`, `${rssMb}MB > ${maxRssMb}MB`);
				state.worker.disconnect();
				setTimeout(() => state.worker.isDead() || state.worker.kill(), 2000);
				continue;
			}
			state.worker.send({ type: "health-check" });
		}
	}, heartbeatIntervalMs);

	cluster.on("exit", (worker, code, signal) => {
		workers.delete(worker.id);
		log(`Worker ${worker.id} exited`, `code=${code} signal=${signal || "none"}`);
		scheduleWorkerStart();
	});

	const shutdown = (signal) => {
		log(`Primary received ${signal}; stopping workers`);
		for (const state of workers.values()) state.worker.disconnect();
		setTimeout(() => process.exit(0), 5000).unref();
	};
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	log("Primary load balancer online", `pid=${process.pid} port=${port} workers=${workerCount} hostCpus=${os.cpus().length}`);
} else if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	import("./firebase.js");
}
