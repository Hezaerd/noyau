# Skill Noyau unique, installé explicitement par Project

> **Statut : accepté.** Complète [ADR-0015](0015-tableau-accessible-aux-agents-par-mcp.md).

Les tools MCP exposent le Tableau mais ne transmettent pas à eux seuls les pratiques de travail de
Noyau. Noyau distribue donc un unique skill portable `noyau`, dont le `SKILL.md` racine route vers
des références spécialisées chargées à la demande. Plusieurs skills installables créeraient des
choix de setup, des déclenchements concurrents et une matrice de versions sans apporter de
frontières d’usage autonomes.

Le skill canonique vit dans `skills/noyau/` et reste utilisable par les canaux compatibles avec
skills.sh. Noyau Desktop embarque exactement ces fichiers et les installe sans réseau ni exécution
de CLI dans `<WorkspaceRoot>/.agents/skills/noyau/`. L’installation est une action explicite et
facultative après la création du Project ; elle peut être reprise depuis les Paramètres.

L’Intégration agent est un état opérationnel du WorkspaceRoot, pas un fait du domaine : le
filesystem est sa source de vérité et aucune Command ou projection SQLite ne la duplique. Noyau
reconnaît ses installations par un manifeste de version et de digests, met à jour seulement une
version gérée restée intacte, et refuse d’écraser ou de retirer des modifications locales. Un
échec d’installation ne remet jamais en cause la création durable du Project.
