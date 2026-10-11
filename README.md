# PVP Node

Relay for two-player local keyboard play. One machine runs the server. Each player runs a client that listens for key presses and injects the mapped key on the other computer.

Each player uses the same keys. The other computer receives a separate player-2 layout, so both fighters can be held at the same time. A key stays down until that same key is released, and it does not auto-repeat. A repeated down for a key that is already held is ignored. If a player disconnects, every key they were holding is released.

Bind the arcade emulator like this:

| | Up | Left | Down | Right | LP | MP | HP | LK | MK | HK |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| You press | W | A | S | D | F | G | T | R | V | B |
| Other PC receives | U | H | J | K | Y | I | O | P | C | E |

`key_map.js` has the same pairs for Linux and Windows. A key that is not listed there is ignored.

## Requirements

- Node.js 18 or newer
- npm

Check both:

```bash
node -v
npm -v
```

## Linux setup

Install Node.js and build tools for the native input modules:

```bash
sudo apt update
sudo apt install -y nodejs npm build-essential python3
```

From the project folder, install dependencies:

```bash
cd pvp-node
npm install
```

The client reads `/dev/input` and writes `/dev/uinput`, so your user needs the `input` group. Log out and back in after this:

```bash
sudo usermod -aG input "$USER"
```

Allow that group to use the virtual keyboard device. The client injects remote keys through `/dev/uinput`:

```bash
echo 'KERNEL=="uinput", GROUP="input", MODE="0660"' | sudo tee /etc/udev/rules.d/99-uinput.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

## Windows setup

Install Node.js LTS from [https://nodejs.org](https://nodejs.org), or from PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell, then install dependencies from the project folder:

```powershell
cd C:\path\to\pvp-node
npm install
```

Windows listens with the system keyboard API and injects a scan-code key press. No extra driver is required. If the game is running as Administrator, start PowerShell as Administrator before launching the client. Edit the `win32` section of `key_map.js` to change which local key triggers which remote key.

## Run

Use three terminals. Start the server first, then both clients. Both clients must use the same room name. Player must be `1` or `2`.

### Server

Linux:

```bash
node server.js
```

Windows PowerShell:

```powershell
node server.js
```

The server listens on `0.0.0.0:8080`. Override that with `HOST` and `PORT` if you need to.

Linux:

```bash
HOST=0.0.0.0 PORT=8080 node server.js
```

Windows PowerShell:

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "8080"
node server.js
```

### Two players on one machine

Terminal 1, Linux or Windows:

```bash
node server.js
```

Terminal 2, Linux:

```bash
node client.js --server ws://127.0.0.1:8080 --room tekken-test --player 1
```

Windows PowerShell:

```powershell
node client.js --server ws://127.0.0.1:8080 --room tekken-test --player 1
```

Terminal 3, Linux:

```bash
node client.js --server ws://127.0.0.1:8080 --room tekken-test --player 2
```

Windows PowerShell:

```powershell
node client.js --server ws://127.0.0.1:8080 --room tekken-test --player 2
```

### Two computers

Run the server on one machine. Replace `192.168.1.10` with that machine's LAN address. Each player can be on Linux or Windows.

Server:

```bash
node server.js
```

Player 1:

```bash
node client.js --server ws://192.168.1.10:8080 --room tekken-test --player 1
```

Player 2:

```bash
node client.js --server ws://192.168.1.10:8080 --room tekken-test --player 2
```

A local press logs `[LOCAL]`. The computer that injects the mapped key logs `[REMOTE]`. For example, pressing A on player 1 prints `[LOCAL] A DOWN` there and `[REMOTE] U DOWN` on player 2.
