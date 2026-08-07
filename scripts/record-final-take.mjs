import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TEST_TIMELINE = {
  mcpMs: 2_000,
  architectureMs: 4_000,
  stopMs: 8_000,
};

const FINAL_TIMELINE = {
  mcpMs: 125_000,
  architectureMs: 145_000,
  stopMs: 170_000,
};

const timeline = process.argv.includes("--test") ? TEST_TIMELINE : FINAL_TIMELINE;
const appData = process.env.APPDATA;

if (!appData) {
  throw new Error("APPDATA is not defined.");
}

const configPath = join(
  appData,
  "obs-studio",
  "plugin_config",
  "obs-websocket",
  "config.json",
);
const config = JSON.parse(await readFile(configPath, "utf8"));

if (!config.server_enabled) {
  throw new Error("OBS WebSocket is disabled. Enable it before recording.");
}

function sha256Base64(value) {
  return createHash("sha256").update(value).digest("base64");
}

function createAuthentication(password, salt, challenge) {
  const secret = sha256Base64(`${password}${salt}`);
  return sha256Base64(`${secret}${challenge}`);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class ObsClient {
  #identified;
  #hello;
  #pending = new Map();
  #requestSequence = 0;
  #socket;

  constructor(port) {
    this.#socket = new WebSocket(`ws://127.0.0.1:${port}`);
    this.#hello = new Promise((resolve) => {
      this.resolveHello = resolve;
    });
    this.#identified = new Promise((resolve) => {
      this.resolveIdentified = resolve;
    });

    this.#socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));

      if (message.op === 0) {
        this.resolveHello(message.d);
        return;
      }

      if (message.op === 2) {
        this.resolveIdentified(message.d);
        return;
      }

      if (message.op === 7) {
        const pending = this.#pending.get(message.d.requestId);
        if (!pending) {
          return;
        }

        this.#pending.delete(message.d.requestId);
        if (message.d.requestStatus.result) {
          pending.resolve(message.d.responseData ?? {});
        } else {
          pending.reject(
            new Error(
              `${message.d.requestType} failed: ${message.d.requestStatus.comment ?? message.d.requestStatus.code}`,
            ),
          );
        }
      }
    });
  }

  async connect(password) {
    await new Promise((resolve, reject) => {
      this.#socket.addEventListener("open", resolve, { once: true });
      this.#socket.addEventListener("error", reject, { once: true });
    });

    const hello = await this.#hello;
    const identify = { rpcVersion: 1 };

    if (hello.authentication) {
      identify.authentication = createAuthentication(
        password,
        hello.authentication.salt,
        hello.authentication.challenge,
      );
    }

    this.#socket.send(JSON.stringify({ op: 1, d: identify }));
    await this.#identified;
  }

  request(requestType, requestData = {}) {
    const requestId = `scopethread-${++this.#requestSequence}`;
    const response = new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
    });

    this.#socket.send(
      JSON.stringify({
        op: 6,
        d: { requestType, requestId, requestData },
      }),
    );
    return response;
  }

  close() {
    this.#socket.close();
  }
}

const client = new ObsClient(config.server_port);
let recordingStarted = false;

try {
  await client.connect(config.server_password);

  const status = await client.request("GetRecordStatus");
  if (process.argv.includes("--stop")) {
    if (status.outputActive) {
      const result = await client.request("StopRecord");
      console.log(`Recording stopped: ${result.outputPath}`);
    } else {
      console.log("OBS is not recording.");
    }
    process.exit(0);
  }

  if (status.outputActive) {
    throw new Error("OBS is already recording.");
  }

  await client.request("SetCurrentProgramScene", { sceneName: "Public demo" });
  await client.request("StartRecord");
  recordingStarted = true;
  console.log("Recording started on scene: Public demo.");

  await wait(timeline.mcpMs);
  await client.request("SetCurrentProgramScene", {
    sceneName: "Managed MCP evidence",
  });
  console.log("Switched to scene: Managed MCP evidence.");

  await wait(timeline.architectureMs - timeline.mcpMs);
  await client.request("SetCurrentProgramScene", {
    sceneName: "Architecture close",
  });
  console.log("Switched to scene: Architecture close.");

  await wait(timeline.stopMs - timeline.architectureMs);
  const result = await client.request("StopRecord");
  recordingStarted = false;
  console.log(`Recording stopped: ${result.outputPath}`);
} catch (error) {
  if (recordingStarted) {
    try {
      await client.request("StopRecord");
    } catch {
      // Preserve the original error while making a best effort to finalize the file.
    }
  }
  throw error;
} finally {
  client.close();
}
