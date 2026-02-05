import chalk from "chalk";
import ora from "ora";
import * as readline from "readline";
import { getConfigManager } from "../../config/manager";
import { getWorkspaceManager } from "../../workspace/manager";
import { createGenieCEOAgent } from "../../agent";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * CEO command - Start the GenieCEO agent
 * Runs the CEO agent in interactive mode
 */
export async function ceoCommand(options: {
  message?: string;
}): Promise<void> {
  try {
    // Load configuration
    const configManager = getConfigManager();
    const config = await configManager.load();

    // Validate configuration
    const validation = await configManager.validate();
    if (!validation.valid) {
      console.error(chalk.red("✗ Configuration error:"));
      validation.errors?.forEach((error) => {
        console.error(chalk.red(`  • ${error}`));
      });
      console.log(chalk.gray('\nRun "genieceo init" to set up configuration'));
      process.exit(1);
    }

    // Ensure workspace is initialized
    const workspaceManager = getWorkspaceManager(config.workspace);
    const isInitialized = await workspaceManager.isInitialized();
    if (!isInitialized) {
      console.log(
        chalk.yellow("Workspace not initialized. Initializing now..."),
      );
      await workspaceManager.init();
    }

    // Create GenieCEO agent
    const spinner = ora('Initializing GenieCEO...').start();
    
    const agent: any = await createGenieCEOAgent(config);
    
    const budget = agent.ceoMemory?.getContextBudget();
    const services = agent.serviceManager?.getRunningServices().length || 0;
    
    spinner.succeed('GenieCEO ready');
    console.log(chalk.gray(`  • Context: ${budget?.genieCEOCurrentTokens || 0} / ${budget?.genieCEOMaxTokens || 50000} tokens`));
    console.log(chalk.gray('  • Staff management: enabled'));
    console.log(chalk.gray(`  • Service management: enabled (${services} running)`));
    console.log(chalk.gray('  • Context engineering: active'));

    // Single message mode
    if (options.message) {
      await handleSingleMessage(agent, options.message);
      return;
    }

    // Interactive mode
    await handleInteractiveMode(agent);
  } catch (error) {
    console.error(chalk.red("\n✗ Error:"));
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    process.exit(1);
  }
}

/**
 * Handle single message mode
 */
async function handleSingleMessage(agent: any, message: string): Promise<void> {
  const spinner = ora("Thinking...").start();

  try {
    const response = await agent.run(message);
    spinner.stop();

    console.log(chalk.blue("\n💬 Response:\n"));
    console.log(response);
    console.log("");
  } catch (error) {
    spinner.fail("Failed");
    throw error;
  }
}

/**
 * Handle interactive mode
 */
async function handleInteractiveMode(agent: any): Promise<void> {
  console.log(chalk.blue.bold("\n🎯 GenieCEO"));
  console.log(
    chalk.gray('Type your message and press Enter. Type "exit" to quit.\n'),
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green("You> "),
  });

  const history: ChatMessage[] = [];

  rl.prompt();

  rl.on("line", (line: string) => {
    const input = line.trim();

    // Handle exit
    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log(chalk.gray("\nGoodbye! 👋\n"));
      rl.close();
      process.exit(0);
    }

    // Skip empty input
    if (!input) {
      rl.prompt();
      return;
    }

    // Pause readline while processing
    rl.pause();

    // Process message
    const spinner = ora("Thinking...").start();

    // Handle async processing
    (async () => {
      try {
        const result = await agent.runWithHistory(input, history);
        spinner.stop();

        // Update history
        history.length = 0;
        history.push(...result.updatedHistory);

        // Display response
        console.log(chalk.blue("\nAssistant> ") + result.response + "\n");
      } catch (error) {
        spinner.fail("Error");
        console.error(
          chalk.red(error instanceof Error ? error.message : String(error)),
        );
        console.log("");
      } finally {
        // Resume readline and show prompt
        rl.resume();
        rl.prompt();
      }
    })();
  });

  rl.on("close", () => {
    console.log(chalk.gray("\nGoodbye! 👋\n"));
    process.exit(0);
  });

  // Handle Ctrl+C
  rl.on("SIGINT", () => {
    console.log(chalk.gray("\n\nGoodbye! 👋\n"));
    process.exit(0);
  });
}
