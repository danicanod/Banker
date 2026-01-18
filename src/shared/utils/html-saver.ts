import fs from 'fs';
import path from 'path';

export class HTMLSaver {
  private htmlDir: string;

  constructor(outputDir: string = 'html-captures') {
    this.htmlDir = path.join(process.cwd(), outputDir);
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.htmlDir)) {
      fs.mkdirSync(this.htmlDir, { recursive: true });
    }
  }

  async saveHTML(page: unknown, filename: string): Promise<void> {
    try {
      const p = page as { content: () => Promise<string> };
      const content = await p.content();
      const filePath = path.join(this.htmlDir, filename);
      fs.writeFileSync(filePath, content);
      console.log(`[html] saved: ${filename}`);
    } catch (error) {
      console.log(`[html] failed to save ${filename}:`, error);
    }
  }

  async saveFrameHTML(frame: unknown, filename: string): Promise<void> {
    try {
      const f = frame as { content: () => Promise<string> };
      const content = await f.content();
      const filePath = path.join(this.htmlDir, filename);
      fs.writeFileSync(filePath, content);
      console.log(`[html] saved frame: ${filename}`);
    } catch (error) {
      console.log(`[html] failed to save frame ${filename}:`, error);
    }
  }

  getOutputDir(): string {
    return this.htmlDir;
  }
}
