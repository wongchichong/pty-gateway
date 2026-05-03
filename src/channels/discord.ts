import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  TextChannel,
  SlashCommandBuilder,
  REST,
  Routes,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  DiscordConfig,
} from "./types.js";

export class DiscordChannel implements Channel {
  readonly type = "discord" as const;
  private client: Client;
  private config: DiscordConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;

  constructor(config: DiscordConfig) {
    this.config = config;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Message handler
    this.client.on(Events.MessageCreate, async (msg) => {
      // Ignore bot messages
      if (msg.author.bot) return;

      // Check channel allowlist
      if (!this.isAllowed(msg)) return;

      const channelMsg = this.toChannelMessage(msg);
      if (channelMsg) {
        await this.messageHandler?.(channelMsg);
      }
    });

    // Ready event
    this.client.on(Events.ClientReady, (client) => {
      console.log(`[Discord] Logged in as ${client.user.tag}`);
      this._connected = true;
    });

    // Interaction handler for slash commands
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const msg = this.interactionToChannelMessage(interaction);
      if (msg) {
        await this.messageHandler?.(msg);
      }
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  private toChannelMessage(msg: Message): ChannelMessage | null {
    return {
      id: msg.id,
      channel: "discord",
      userId: msg.author.id,
      chatId: msg.channelId,
      text: msg.content,
      replyTo: msg.reference?.messageId,
      timestamp: msg.createdTimestamp,
      raw: msg,
    };
  }

  private interactionToChannelMessage(
    interaction: ReturnType<Client["on"] extends (event: string, cb: (i: infer I) => void) => void ? I : never>
  ): ChannelMessage | null {
    if (!interaction.isChatInputCommand()) return null;

    const commandName = interaction.commandName;
    const options = interaction.options.data.map((o: { value: unknown }) => String(o.value));

    return {
      id: interaction.id,
      channel: "discord",
      userId: interaction.user.id,
      chatId: interaction.channelId || "",
      text: `/${commandName} ${options.join(" ")}`,
      timestamp: Date.now(),
      raw: interaction,
    };
  }

  private isAllowed(msg: Message): boolean {
    // Check guild restriction
    if (this.config.guildId && msg.guild?.id !== this.config.guildId) {
      return false;
    }

    // Check channel allowlist
    const allowedChannels = this.config.allowedChannels;
    if (allowedChannels && allowedChannels.length > 0) {
      if (!allowedChannels.includes(msg.channelId)) {
        return false;
      }
    }

    return true;
  }

  async start(): Promise<void> {
    try {
      await this.client.login(this.config.botToken);

      // Register slash commands
      await this.registerCommands();
    } catch (err) {
      console.error("[Discord] Failed to start:", err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.client.destroy();
    this._connected = false;
    console.log("[Discord] Bot stopped");
  }

  private async registerCommands(): Promise<void> {
    const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
      new SlashCommandBuilder()
        .setName("start")
        .setDescription("Start a new PTY instance")
        .addStringOption((opt) =>
          opt.setName("command").setDescription("Command to run").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("args").setDescription("Command arguments").setRequired(false)
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("connect")
        .setDescription("Connect to a PTY instance")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("PTY instance ID").setRequired(false)
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("kill")
        .setDescription("Kill the current PTY instance")
        .toJSON(),

      new SlashCommandBuilder()
        .setName("list")
        .setDescription("List all PTY instances")
        .toJSON(),

      new SlashCommandBuilder()
        .setName("snapshot")
        .setDescription("Get current PTY buffer snapshot")
        .toJSON(),

      new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show available commands")
        .toJSON(),
    ];

    const rest = new REST().setToken(this.config.botToken);

    try {
      if (this.config.globalCommands) {
        // Register globally (takes up to 1 hour to propagate)
        await rest.put(Routes.applicationCommands(this.client.user!.id), {
          body: commands,
        });
        console.log("[Discord] Registered global slash commands");
      } else if (this.config.guildId) {
        // Register for specific guild (instant)
        await rest.put(
          Routes.applicationGuildCommands(this.client.user!.id, this.config.guildId),
          { body: commands }
        );
        console.log(`[Discord] Registered guild slash commands for ${this.config.guildId}`);
      }
    } catch (err) {
      console.error("[Discord] Failed to register commands:", err);
    }
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<string> {
    try {
      const channel = await this.client.channels.fetch(chatId);
      if (!channel || !channel.isTextBased()) {
        throw new Error(`Channel ${chatId} not found or not text-based`);
      }

      // Cast to text-based channel that has send method
      const textChannel = channel as unknown as { send: (content: string | { content: string; reply?: { messageReference: string } }) => Promise<{ id: string }> };

      // Handle chunking
      const maxLen = options?.maxChunkSize || 2000;

      if (options?.chunk && text.length > maxLen) {
        const chunks = this.chunkText(text, maxLen);
        const ids: string[] = [];

        for (const chunk of chunks) {
          const msg = await textChannel.send(chunk);
          ids.push(msg.id);
        }

        return ids.join(",");
      }

      const msg = await textChannel.send({
        content: text,
        reply: options?.replyTo ? { messageReference: options.replyTo } : undefined,
      });

      return msg.id;
    } catch (err) {
      console.error("[Discord] Failed to send message:", err);
      throw err;
    }
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text, {
      replyTo: message.id,
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  private chunkText(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    const lines = text.split("\n");
    let current = "";

    for (const line of lines) {
      if (current.length + line.length + 1 > maxLen) {
        if (current) chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }
}

// Factory function
export function createDiscordChannel(config: DiscordConfig): DiscordChannel {
  return new DiscordChannel(config);
}
