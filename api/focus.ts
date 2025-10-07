export const config = { runtime: "edge" };

const OLINDA_URL = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoInflacao12Meses?$top=12&$format=json";

export default async function handler(req: Request): Promise<Response> {
  try {
    const r = await fetch(OLINDA_URL, { headers: { "accept": "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const rows = Array.isArray(j?.value) ? j.value : [];
    let annual: number | null = null;
    for (let i=rows.length-1; i>=0; i--) {
      const cand = [rows[i].mediana, rows[i].Mediana, rows[i].valor, rows[i].Valor];
      for (const c of cand) {
        const x = Number(c);
        if (Number.isFinite(x)) { annual = x; break; }
      }
      if (annual != null) break;
    }
    if (annual == null) throw new Error("no_value");
    return new Response(JSON.stringify({ ok:true, fonte:"BCB/Olinda", indice:"IPCA", horizonte:"12m", annual }), {
      status: 200,
      headers: {
        "content-type":"application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=21600, max-age=3600, stale-while-revalidate=86400"
      }
    });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || "error" }), {
      status: 502, headers: { "content-type":"application/json" }
    });
  }
}
