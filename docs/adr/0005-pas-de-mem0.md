# Pas de Mem0 ni de couche mémoire produit

---

Statut : accepté.

---

Noyau n'intègre pas Mem0 (ni OpenMemory, ni offre managée) et n'expose pas de port `MemoryStore`.
Le `ContextPack` se construit depuis les projections et le journal d'événements. Une mémoire produit
externe redeviendrait un sujet seulement si un besoin réel apparaît ; ce n'est pas un chantier v1.
