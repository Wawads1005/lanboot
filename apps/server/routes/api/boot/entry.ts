import e from "express";
import { getEntries } from "@/controllers/boot/entry";

const entryRouter = e.Router();

entryRouter.get("/", getEntries);

export default entryRouter;
