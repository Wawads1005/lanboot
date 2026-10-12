import e from "express";
import entryRouter from "@/routes/api/boot/entry";
import { overlayHandler } from "@/controllers/boot/overlay";
import { scriptHandler } from "@/controllers/boot/script";

const bootRouter = e.Router();

bootRouter.use("/entry", entryRouter);

bootRouter.get("/", scriptHandler);
bootRouter.post("/", overlayHandler);

export default bootRouter;
