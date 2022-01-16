import { Server as WebSocketServer } from "ws";
import { WebSocket, Payload, } from "@fosscord/gateway";
import { Config, initDatabase } from "@fosscord/util";
import OPCodeHandlers from "./opcodes";
import { setHeartbeat } from "./util";
import * as mediasoup from "mediasoup";
import { types as MediasoupTypes } from "mediasoup";

var port = Number(process.env.PORT);
if (isNaN(port)) port = 3004;

export class Server {
	public ws: WebSocketServer;
	public mediasoupWorkers: MediasoupTypes.Worker[] = [];
	public mediasoupRouters: MediasoupTypes.Router[] = [];
	public mediasoupTransports: MediasoupTypes.Transport[] = [];

	constructor() {
		this.ws = new WebSocketServer({
			port,
			maxPayload: 4096,
		});
		this.ws.on("connection", async (socket: WebSocket) => {
			await setHeartbeat(socket);

			socket.on("message", async (message: string) => {
				const payload: Payload = JSON.parse(message);

				if (OPCodeHandlers[payload.op])
					await OPCodeHandlers[payload.op].call(this, socket, payload);
				else
					console.error(`Unimplemented`, payload);
			});
		});
	}

	async listen(): Promise<void> {
		// @ts-ignore
		await initDatabase();
		await Config.init();
		await this.createWorkers();
		console.log("[DB] connected");
		console.log(`[WebRTC] online on 0.0.0.0:${port}`);
	}

	async createWorkers(): Promise<void> {
		const numWorkers = 1;
		for (let i = 0; i < numWorkers; i++) {
			const worker = await mediasoup.createWorker();
			if (!worker) return;

			worker.on("died", () => {
				console.error("mediasoup worker died");
			});

			worker.observer.on("newrouter", async (router: MediasoupTypes.Router) => {
				console.log("new router created [id:%s]", router.id);

				this.mediasoupRouters.push(router);

				router.observer.on("newtransport", async (transport: MediasoupTypes.Transport) => {
					console.log("new transport created [id:%s]", transport.id);

					await transport.enableTraceEvent();

					transport.observer.on("newproducer", (producer: MediasoupTypes.Producer) => {
						console.log("new producer created [id:%s]", producer.id);
					});

					transport.observer.on("newconsumer", (consumer: MediasoupTypes.Consumer) => {
						console.log("new consumer created [id:%s]", consumer.id);
					});

					transport.observer.on("newdataproducer", (dataProducer) => {
						console.log("new data producer created [id:%s]", dataProducer.id);
					});

					transport.on("trace", (trace) => {
						console.log(trace);
					});

					this.mediasoupTransports.push(transport);
				});
			});

			await worker.createRouter({
				mediaCodecs: [
					{
						kind: "audio",
						mimeType: "audio/opus",
						clockRate: 48000,
						channels: 2
					},
					{
						kind: "video",
						mimeType: "video/H264",
						clockRate: 90000,
						parameters:
						{
							"packetization-mode": 1,
							"profile-level-id": "42e01f",
							"level-asymmetry-allowed": 1
						}
					}
				]
			});

			this.mediasoupWorkers.push(worker);
		}
	}
}
