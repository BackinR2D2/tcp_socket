import * as net from 'net';
import * as readline from 'readline';

const TCP_PORT = 3000;

const client = new net.Socket();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let clientId: number;
let matchId: number;

client.connect(TCP_PORT, 'localhost', () => {
  console.log('Connected to server');

  client.on('data', async (data) => {
    const message = data.toString();
    const parts = message.split(':');
    const command = parts[0];

    if (command === 'ID') {
      clientId = parseInt(parts[1], 10);
      console.log(`Client ID assigned: ${clientId}`);
      showMenu();
    } else if (command === 'OPPONENTS') {
      const opponents = parts[1].split(',');
      console.log('Available opponents: ', opponents);
      showMenu();
    } else if (command === 'MATCH_CONFIRMED') {
      matchId = parseInt(parts[1], 10);
      console.log(`Match confirmed. Match ID: ${matchId}`);
      if (parts[2].toString() === 'CLIENT') {
        console.log(`You are Player A.`);
      } else if(parts[2] === 'OPPONENT'){
        console.log(`You are Player B.`);
        rl.resume();
        rl.question('Make a guess: ', (guess) => {
          client.write(`GUESS:${matchId}:${guess}`);
        });
      }
    } else if (command === 'MAKE_GUESS') {
      rl.question('Make a guess: ', (guess) => {
        client.write(`GUESS:${matchId}:${guess}`);
      });
    } else if (command === 'MATCH_UPDATE') {
      const updateMessage = parts.slice(1).join(':');
      console.log('Opponent update:', updateMessage);
    } else {
      console.log(`Server response: ${message}`);
    }
  });

  rl.question('Enter password: ', (password) => {
    client.write(`PASSWORD:${password}`);
  });
});

client.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});

function showMenu() {
  console.log('\n--- Menu ---');
  console.log('1. List Opponents');
  console.log('2. Challenge Someone');
  console.log('3. Exit');

  rl.question('Select an option: ', (option) => {
    switch (option) {
      case '1':
        listOpponents();
        break;
      case '2':
        challengeOpponent();
        break;
      case '3':
        rl.close();
        process.exit(1);
      default:
        console.log('Invalid option. Please try again.');
        showMenu();
        break;
    }
  });
}

function listOpponents() {
  client.write('LIST_OPPONENTS');
}

function challengeOpponent() {
  rl.question('Enter opponent ID: ', (opponentId) => {
    rl.question('Enter word to guess: ', (wordToGuess) => {
      rl.question('Enter word hint: ', (hint) => {
        client.write(`REQUEST_MATCH:${opponentId}:${wordToGuess}:${hint}\n`);
      });
    });
  });
}
