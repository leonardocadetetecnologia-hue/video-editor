// Registro das animações em código. Para criar uma nova:
// 1. crie src/remotion/custom/MinhaAnimacao.tsx exportando um CustomComponentDef;
// 2. adicione aqui com um id em kebab-case (é o "componentId" usado no projeto).
// Use só imports relativos e de "remotion"/"react" (o bundle de render não conhece "@/").
import { barraProgresso } from "./BarraProgresso";
import { confete } from "./Confete";
import { contagemRegressiva } from "./ContagemRegressiva";
import { legendas } from "./Legendas";
import { tituloCinetico } from "./TituloCinetico";
import type { CustomComponentDef } from "./types";

export const CUSTOM_COMPONENTS: Record<string, CustomComponentDef> = {
  "legendas": legendas,
  "titulo-cinetico": tituloCinetico,
  "contagem-regressiva": contagemRegressiva,
  "barra-progresso": barraProgresso,
  "confete": confete,
};
