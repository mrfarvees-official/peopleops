import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BlobStore } from "../application/data-ports";

/** Stores backup files in a directory. Swap for object storage by implementing BlobStore. */
export class FsBlobStore implements BlobStore {
  constructor(private readonly dir: string) {}

  // Keys are generated ids; refuse anything that could leave the directory.
  private file(key: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(key) || key.startsWith(".")) throw new Error("Bad storage key");
    return path.join(this.dir, key);
  }

  async put(key: string, bytes: Uint8Array) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(key), bytes);
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
}
