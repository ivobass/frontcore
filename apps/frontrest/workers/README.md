# FrontRest IA — Workers

Estrutura reservada para os workers do produto (OCR e IA), implementados na
**Fase 6**. Correrão como serviços NestJS standalone (sem HTTP), consumindo
filas BullMQ sobre Redis e os packages do FrontCore.

Na Fase 1 esta pasta existe apenas para fixar a estrutura do monorepo.
Nenhum worker é construído nem incluído no docker-compose ainda.
