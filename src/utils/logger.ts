import * as vscode from 'vscode';

export class Logger {
  private static instance: Logger | undefined;
  private readonly channel: vscode.OutputChannel;

  private constructor(context: vscode.ExtensionContext) {
    this.channel = vscode.window.createOutputChannel(
      'Python Package Visualizer'
    );
    context.subscriptions.push(this.channel);
  }

  static getInstance(context: vscode.ExtensionContext): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(context);
    }
    return Logger.instance;
  }

  static resetInstance(): void {
    Logger.instance = undefined;
  }

  debug(msg: string): void {
    this.log('DEBUG', msg);
  }

  info(msg: string): void {
    this.log('INFO', msg);
  }

  warn(msg: string): void {
    this.log('WARN', msg);
  }

  error(msg: string): void {
    this.log('ERROR', msg);
    this.channel.show(true);
  }

  show(): void {
    this.channel.show(true);
  }

  private log(level: string, msg: string): void {
    const ts = new Date().toISOString();
    this.channel.appendLine(`[${ts}] [${level}] ${msg}`);
  }
}
