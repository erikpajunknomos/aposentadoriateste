export const config = { runtime: "edge" };

type Indice = "IPCA" | "IPCA-15" | "IGP-M";

function ymToDateStr(ym: string, endOfMonth=false): string {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const d = endOfMonth ? lastDay : 1;
  const pad = (n:number)=> String(n).padStart(2,"0");
  return `${pad(d)}/${pad(m)}/${y}`;
}

function monthKey(dmy: string): string {
  const [d,m,y] = dmy.split("/").map(s=>s.trim());
  return `${y}-${m}`;
}

function geomAnnualizedPct(monthlyRates: number[]): number | null {
  const vals = monthlyRates.map(r => 1 + r/100).filter(x => x > 0);
  if (vals.length === 0) return null;
  const prod = vals.reduce((a,b)=>a*b, 1);
  const annual = Math.pow(prod, 12/vals.length) - 1;
  return annual * 100;
}

async function fetchSGS(codigo: number, ini?: string, fim?: string): Promise<any[]> {
  const base = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados`;
  const qs = new URLSearchParams({ formato: "json" });
  if (ini) qs.set("dataInicial", ymToDateStr(ini, false));
  if (fim) qs.set("dataFinal", ymToDateStr(fim, true));
  const url = `${base}?${qs.toString()}`;
  const resp = await fetch(url, { headers: { "accept": "application/json" } });
  if (!resp.ok) throw new Error(`SGS HTTP ${resp.status}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

function rangeYM(periodo: string | undefined): { ini: string, fim: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,"0");
  const fim = `${y}-${m}`;
  if (periodo === "10y") return { ini: `${y-10}-${m}`, fim };
  if (periodo === "5y") return { ini: `${y-5}-${m}`, fim };
  if (periodo === "12m") return { ini: `${y}-${m}`, fim };
  return { ini: `${y-10}-${m}`, fim };
}

export default async function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const indice = (searchParams.get("indice") as Indice) || "IPCA";
    const periodo = searchParams.get("periodo") || "10y";
    const customIni = searchParams.get("ini") || undefined;
    const customFim = searchParams.get("fim") || undefined;

    const { ini, fim } = customIni && customFim ? { ini: customIni, fim: customFim } : rangeYM(periodo);

    const codigos: Record<Indice, number> = { "IPCA": 433, "IPCA-15": 7478, "IGP-M": 189 };
    const serie = await fetchSGS(codigos[indice], ini, fim);

    const byMonth = new Map<string, number>();
    for (const row of serie) {
      const key = monthKey(row.data);
      const val = Number(String(row.valor).replace(",", "."));
      if (Number.isFinite(val)) byMonth.set(key, val);
    }
    const keys = Array.from(byMonth.keys()).sort();
    const serieYM = keys.map(k => ({ ym: k, pct_mensal: byMonth.get(k)! }));

    const lastN = (n: number) => serieYM.slice(-n).map(r => r.pct_mensal);
    const media_5a = geomAnnualizedPct(lastN(60));
    const media_10a = geomAnnualizedPct(lastN(120));

    return new Response(JSON.stringify({
      ok: true, indice, periodo, ini, fim, serie: serieYM, media_5a, media_10a, fonte: "BCB/SGS"
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=21600, max-age=3600, stale-while-revalidate=86400"
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok:false, error: err?.message || "error" }), { status: 502 });
  }
}
