import "dotenv/config";
import { Client, GatewayIntentBits, REST, Routes, Events } from "discord.js";
import { joinVoiceChannel, getVoiceConnection } from "@discordjs/voice";

/* ===== 環境変数 ===== */
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ 環境変数 DISCORD_TOKEN / CLIENT_ID / GUILD_ID が足りません");
  process.exit(1);
}

/* ===== Client ===== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

/* ===== スラッシュコマンド ===== */
const commands = [
  {
    name: "join",
    description: "ボイスチャンネルに参加"
  },
  {
    name: "leave",
    description: "ボイスチャンネルから退出"
  }
];

/* ===== コマンド登録 ===== */
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log("⏳ スラッシュコマンド登録中...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ スラッシュコマンド登録完了");
  } catch (error) {
    console.error("❌ スラッシュコマンド登録失敗", error);
  }
}

/* ===== 起動 ===== */
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await registerCommands();
});

/* ===== コマンド処理 ===== */
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  /* /join */
  if (interaction.commandName === "join") {
    const channel = interaction.member.voice.channel;

    if (!channel) {
      return interaction.reply({
        content: "先にボイスチャンネルに入ってね",
        ephemeral: true
      });
    }

    joinVoiceChannel({
      channelId: channel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator
    });

    await interaction.reply("ボイスチャンネルに参加したよ");
  }

  /* /leave */
  if (interaction.commandName === "leave") {
    const connection = getVoiceConnection(interaction.guild.id);

    if (!connection) {
      return interaction.reply({
        content: "ボイスチャンネルに入ってないよ",
        ephemeral: true
      });
    }

    connection.destroy();
    await interaction.reply("ボイスチャンネルから退出したよ");
  }
});

/* ===== ログイン ===== */
client.login(DISCORD_TOKEN);

