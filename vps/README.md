# VPS · service selfty-agenda

`server.js` tourne sur le VPS de secours (`/opt/selfty-agenda`, unité systemd `selfty-agenda`, port 8711), exposé par nginx sur `https://187-77-169-11.sslip.io/pratiques/agenda.ics`. `config.json` (non versionné) : `{ "pont": "<URL /exec du pont>", "key": "<KEY>", "ecole_ics": "https://selfty-academy.github.io/agenda/calls-selfty.ics" }`.

Mise à jour : `scp vps/server.js alex@187.77.169.11:/opt/selfty-agenda/ && ssh alex@187.77.169.11 sudo systemctl restart selfty-agenda`.
Logs : `ssh alex@187.77.169.11 journalctl -u selfty-agenda -n 50`.
