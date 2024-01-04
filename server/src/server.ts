import dotenv from 'dotenv';
dotenv.config();
import * as net from 'net';
import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';

interface Client {
  id: number;
  socket: net.Socket;
}

interface Match {
  id: number;
  wordToGuess: string;
  clientA: Client;
  clientB: Client;
  attempts: number;
  hint: string;
  progress: string;
  clientTurn: net.Socket;
}

const clients: Client[] = [];
const matches: Match[] = [];

const server = net.createServer((socket) => {
  console.log('Client connected');

  const initialMessage = Buffer.from('Hello, please enter your password');
  socket.write(initialMessage);

  socket.on('data', (data) => {
    const message = data.toString();
    const parts = message.split(':');
    const command = parts[0];

    if (command === 'PASSWORD') {
      const password = parts[1];
      if (password === process.env.PASSWORD) {
        const clientId = Math.floor(Math.random() * 1000);
        const newClient: Client = { id: clientId, socket };
        clients.push(newClient);

        socket.write(`ID:${clientId}`);
        console.log(`Client ID ${clientId} assigned`);

        socket.on('data', (requestData) => {
          const request = requestData.toString();
          handleRequest(newClient, request);
        });
      } else {
        socket.end('Wrong password. Disconnecting...');
        console.log('Client disconnected due to wrong password');
      }
    }
  });

  socket.on('error', (e) => {
    console.log('Caught error: ');
    console.log(e);
  });

  socket.on('end', () => {
    const disconnectedClientIndex = clients.findIndex((c) => c.socket === socket);
    if (disconnectedClientIndex !== -1) {
      clients.splice(disconnectedClientIndex, 1);
      console.log('Client disconnected');
    }
  });
});

function handleRequest(client: Client, request: string) {
  const parts = request.split(':');
  const command = parts[0];

  switch (command) {
    case 'LIST_OPPONENTS':
      const opponentIds = clients
        .filter((c) => c.id !== client.id)
        .map((c) => c.id)
        .join(',');
      client.socket.write(`OPPONENTS:${opponentIds}`);
      break;
    case 'REQUEST_MATCH':
      const opponentId = parseInt(parts[1], 10);
      const wordToGuess = parts[2];
      const hint = parts[3];
      handleMatchRequest(client, opponentId, wordToGuess, hint);
      break;
    case 'GUESS':
      const matchId = parts[1];
      const guess = parts[2];
      const match = matches.find((match) => match.id === +matchId);
      console.log('Guess ' + matchId);
      if (match) {
        handleMatchGuess(match, guess);
      } else {
        client.socket.write('ERROR:Invalid Match ID');
      }
      break;
    default:
      client.socket.write('ERROR:Invalid request\n');
  }
}

function handleMatchRequest(client: Client, opponentId: number, wordToGuess: string, hint: string) {
  const opponent = clients.find((c) => c.id === opponentId);

  if (opponent) {
    const matchId = matches.length + 1;
    const newMatch: Match = {
      id: matchId,
      wordToGuess,
      clientA: client,
      clientB: opponent,
      attempts: wordToGuess.length + 3,
      hint,
      progress: '_'.repeat(wordToGuess.length),
      clientTurn: client.socket,
    };
    matches.push(newMatch);

    client.socket.write(`MATCH_CONFIRMED:${matchId}:CLIENT`);
    opponent.socket.write(`MATCH_CONFIRMED:${matchId}:OPPONENT`);

  } else {
    client.socket.write('ERROR:Opponent not found\n');
  }
}

function handleMatchGuess(match: Match, guess: string) {
  match.clientB.socket.write(`Word hint: ${match.hint}. Word to guess: ${match.progress}.`);
  if (guess.length > 1 && guess.length < match.wordToGuess.length) {
    match.clientA.socket.write(`${guess} is incorrect, only letters or full word guess are allowed\n`);
    match.clientB.socket.write(`${guess} is incorrect, only letters or full word guess are allowed\n`);
    match.clientB.socket.write(`MAKE_GUESS:${match.id}`);
  }
  if (guess.length === match.wordToGuess.length) {
    if (guess === match.wordToGuess) {
      match.clientA.socket.write(`Match LOST\n`);
      match.clientB.socket.write(`Match WON\n`);
    } else {
      match.clientA.socket.write(`Match WON\n`);
      match.clientB.socket.write(`Match LOST\n`);
    }
  }
  if (match.attempts === 0) {
    match.clientA.socket.write(`Match WON\n`);
    match.clientB.socket.write(`Match LOST\n`);
  }
  if (match.wordToGuess.includes(guess) && match.attempts !== 0) {
    const guessIndex = match.wordToGuess.split('').map((char, index) => {
      if (guess === char) {
        return index;
      }
      return null;
    });
    const progressChars = [...match.progress];
    guessIndex.forEach((index) => {
      if (index) progressChars[index] = guess;
    });
    match.progress = progressChars.join('');
    match.clientA.socket.write(`${guess} is correct, attempts remaining: ${--match.attempts}\n ${match.progress}\n`);
    match.clientB.socket.write(`${guess} is correct, attempts remaining: ${--match.attempts}\n ${match.progress}\n`);
    match.clientB.socket.write(`MAKE_GUESS:${match.id}`);
  } else if (match.wordToGuess.includes(guess) && match.attempts !== 0) {
    match.clientA.socket.write(`${guess} is incorrect, attempts remaining: ${--match.attempts}\n ${match.progress}\n`);
    match.clientB.socket.write(`${guess} is incorrect, attempts remaining: ${--match.attempts}\n ${match.progress}\n`);
    match.clientB.socket.write(`MAKE_GUESS:${match.id}`);
  }
}

const httpServer = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url!, true);

  if (parsedUrl.pathname === '/matches') {
    const matchList = matches.map((match) => {
      return {
        id: match.id,
        clientA: match.clientA.id,
        clientB: match.clientB.id,
        attempts: match.attempts,
        hint: match.hint,
        progress: match.progress,
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(matchList));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const TCP_PORT = 3000;
const UNIX_SOCKET_PATH = '/tmp/game_server.sock';

server.listen(TCP_PORT, () => {
  console.log(`Server listening on TCP port ${TCP_PORT}`);
});

if (process.platform !== 'win32') {
  server.listen(UNIX_SOCKET_PATH, () => {
    console.log(`Server listening on Unix socket ${UNIX_SOCKET_PATH}`);
  });

  process.on('exit', () => {
    if (fs.existsSync(UNIX_SOCKET_PATH)) {
      fs.unlinkSync(UNIX_SOCKET_PATH);
    }
  });
}

httpServer.listen(8080, () => {
  console.log('HTTP server listening on port 8080');
});
