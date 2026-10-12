import { overlayHandler } from "@/controllers/boot/overlay";
import { scriptHandler } from "@/controllers/boot/script";
import e from "express";

const bootRouter = e.Router();

bootRouter.get("/", scriptHandler);
bootRouter.post("/", overlayHandler);

export default bootRouter;
