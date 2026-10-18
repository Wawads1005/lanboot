import e from "express";
import { getEntries, getEntry } from "@/controllers/boot/entry";

const entryRouter = e.Router();

entryRouter.get("/", getEntries);
entryRouter.get("/:id", getEntry);

export default entryRouter;
