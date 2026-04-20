import { $ } from 'bun';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

export class DockerProvider {
  constructor(private baseDir: string = './workspaces') {}

  async provision(opts: { workspaceId: string }) {
    const rootPath = path.join(process.cwd(), this.baseDir, opts.workspaceId);
    await mkdir(rootPath, { recursive: true });

    const dockerfile = `
FROM oven/bun:latest
WORKDIR /app
COPY . .
RUN bun install
CMD ["bun", "run", "src/runtime/orchestrator.ts"]
    `.trim();

    await writeFile(path.join(rootPath, 'Dockerfile'), dockerfile);
    
    // Build the image (namespaced by workspace)
    const imageName = `autoorg-ws-${opts.workspaceId.toLowerCase()}`;
    await $`docker build -t ${imageName} ${rootPath}`.quiet();

    return { rootPath, imageName };
  }

  async run(workspaceId: string, runConfig: any) {
    const imageName = `autoorg-ws-${workspaceId.toLowerCase()}`;
    // Running the container with workspace mount
    const containerId = await $`docker run -d --rm -v ${path.join(process.cwd(), this.baseDir, workspaceId)}:/app ${imageName}`.text();
    return containerId.trim();
  }

  async cleanup(workspaceId: string) {
    const imageName = `autoorg-ws-${workspaceId.toLowerCase()}`;
    await $`docker rmi ${imageName}`.quiet().nothrow();
  }
}
