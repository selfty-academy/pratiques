# VPS · service selfty-agenda

`server.js` = l'API de la page (`/pratiques/api`, lecture instantanée + écritures instantanées avec file d'attente vers le pont) et le flux agenda fusionné. Il tourne sur le VPS de secours (`/opt/selfty-agenda`, unité systemd `selfty-agenda`, port 8711), exposé par nginx sur `https://187-77-169-11.sslip.io/pratiques/agenda.ics`. `config.json` (non versionné, chmod 600) : `{ "pont": "<URL /exec du pont>", "key": "<KEY>", "vkey": "<VPS_SECRET, propriété de script du pont>", "ecole_ics": "https://selfty-academy.github.io/agenda/calls-selfty.ics" }`. `queue.json` = écritures pas encore poussées vers le pont (normalement vide).

Mise à jour : `scp vps/server.js alex@187.77.169.11:/opt/selfty-agenda/ && ssh alex@187.77.169.11 sudo systemctl restart selfty-agenda`.
Logs : `ssh alex@187.77.169.11 journalctl -u selfty-agenda -n 50`.
