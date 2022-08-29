import { Router, Response, Request } from "express";
import { route } from "@fosscord/api";
import os from "os";

const router = Router();

router.get("/", route({ right: "OPERATOR" }), async (req: Request, res: Response) => {
	return res.json({
		load: os.loadavg(),
		procUptime: process.uptime(),
		sysUptime: os.uptime(),
		memPercent: 100 - ((os.freemem() / os.totalmem()) * 100),
	})
})

export default router;