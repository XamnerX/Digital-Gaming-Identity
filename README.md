# Digital-Gaming-Identity

An interactive data visualisation project that uses a player’s Steam library and playtime data to generate a personalised profile, combining quantitative overview with interpretive characterisation.

## Concept / Intent

This project explores how patterns of play can be translated into a visual and interpretive profile. Rather than presenting Steam data only as raw statistics, it reorganises library structure, playtime distribution, and play-mode tendencies into a readable composition that combines diagrammatic comparison with a character-like summary.

At the centre of the project is the question of how personal game history can be reframed as a form of behavioural portrait. The visualisation does not aim to produce an objective truth about the player, but instead offers a speculative reading based on recurring preferences, dominant genres, time investment, and patterns of solo or social play.

The project combines a playful interpretive layer with more transparent evidence structures. The donut chart shows the relative concentration of playtime, while additional charts compare library breadth against actual play preference and map tendencies such as single-player versus multiplayer, co-op versus PvP, or broad versus focused engagement. In this way, the work sits between data portraiture, interface design, and reflective profiling.

## Interaction & System Behaviour

- The user inputs a Steam profile URL.
- The system fetches owned game data from the Steam Web API.
- It resolves either a SteamID profile link or a vanity URL.
- Playtime data is processed to extract the most significant games by share of total playtime.
- Additional metadata such as genres and categories is retrieved from Steam store data.
- The interface generates a personalised profile card including:
  1. Player name and avatar
  2. A generated archetype title
  3. Top genres and top games
  4. A short interpretive reading
- The visualisation includes:
  - A donut chart showing playtime share distribution
  - A comparison chart of **library presence vs play preference**
  - A **play mode profile** based on category tendencies
  - A **reading profile** that interprets focus, sociability, and intensity
- Hovering over donut segments reveals tooltip information.
- Recently played titles are marked within the donut chart.

### Input

Paste a valid Steam profile URL into the input field.

Examples:
- `https://steamcommunity.com/id/username`
- `https://steamcommunity.com/profiles/7656119...`

### Interaction

- **Generate**: fetch and visualise the player profile
- **Mouse hover** on the donut chart: reveal segment tooltip

## Technology Used

- p5.js
- JavaScript
- Node.js
- Express
- HTML / CSS
- Steam Web API
- Steam Store API metadata

## How to Run / Install

### Local Version

1. Download or clone this repository.
2. Open the project folder in **Visual Studio Code**.
3. Install dependencies:

```bash
npm install
```

4. Create a `.env` file in the project root and add your Steam API key:

```env
STEAM_KEY=your_steam_web_api_key_here
```

5. Start the server:

```bash
node app.js
```

Or, if your setup uses npm scripts:

```bash
npm start
```

6. Open the local address shown in the terminal, usually:

```text
http://localhost:3000
```

7. Paste a Steam profile link into the input field and click **Generate**.

## Requirements

### Hardware
- Laptop or desktop computer

### Software
- Modern web browser (Chrome or Edge recommended)
- Node.js
- Visual Studio Code (recommended for local running)

### Environment
- Internet connection is required, as the system depends on Steam API and store metadata requests.
- A valid Steam Web API key is required for local use.
- The target Steam profile must have public game details; private libraries may return incomplete or unavailable data.


## Credits / Acknowledgements

Created by Haiyi Xiao.

This project draws on interests in data portraiture, interface-based interpretation, and the translation of behavioural traces into visual form. It explores how gameplay records can function not only as measurable statistics, but also as material for speculative profiling and reflective reading.

During the development of this project, ChatGPT (OpenAI) was used as a coding assistant to support parts of the implementation process, including API handling, data structuring, chart logic, layout adjustment, and interaction debugging. All creative decisions, profiling logic, interpretation design, visual composition, and final editorial choices were independently developed by the author through iterative testing and refinement.

## License

This project is shared for educational and non-commercial purposes.

## References

- Valve. *Steam Web API*. Available at: https://developer.valvesoftware.com/wiki/Steam_Web_API
- Valve. *Steam Store API / appdetails endpoint*. Available at: https://store.steampowered.com/api/appdetails
- OpenAI. (2024). *ChatGPT*. Available at: https://chat.openai.com/

## Contact / Links

- **GitHub Repository:** https://github.com/XamnerX/Digital-Gaming-Identity
