import { runMonitor } from "./monitor";

if (process.env.STOCKSCOPE_LOCAL_OPERATOR !== "1") {
  process.stderr.write("Set STOCKSCOPE_LOCAL_OPERATOR=1 to run the local monitor.\n");
  process.exitCode = 1;
} else {
  runMonitor().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "monitor_failed"}\n`);
    process.exitCode = 1;
  });
}
