import e from "express";
import appRouter from "@/routes";
import config from "@/lib/config";

const app = e();

app.use(e.json());

app.use(e.static(config.server.static.directory));

app.use(e.urlencoded({ extended: false }));

app.use(appRouter);

app.listen(config.server.port, config.network.address, (error) => {
  if (error instanceof Error) {
    console.error(`Lanboot: ${error.message}`);
    return;
  }

  const url = new URL(
    "/",
    `http://${config.network.address}:${config.server.port}`,
  );

  console.log(`Server listening on ${url.href}`);
});
