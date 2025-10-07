import React, { useEffect, useState } from "react";

function formatNumber(n:number, d=2){ return n.toLocaleString("pt-BR", {minimumFractionDigits:d, maximumFractionDigits:d}); }

export default function App(){
  const [modePrice, setModePrice] = useState<"real"|"nominal">("real");
  const [inflationIndex, setInflationIndex] = useState<"IPCA"|"IPCA-15"|"IGP-M">("IPCA");
  const [inflationAnnual, setInflationAnnual] = useState<number>(4.0);

  const [avg5y, setAvg5y] = useState<number|null>(null);
  const [avg10y, setAvg10y] = useState<number|null>(null);
  const [inflLoading, setInflLoading] = useState(false);
  const [inflError, setInflError] = useState<string|null>(null);

  const [focusLoading, setFocusLoading] = useState(false);
  const [focusError, setFocusError] = useState<string|null>(null);
  const [lastFocusApplied, setLastFocusApplied] = useState<number|null>(null);

  const [realizedLoading, setRealizedLoading] = useState(false);
  const [realizedError, setRealizedError] = useState<string|null>(null);
  const [lastRealizedApplied, setLastRealizedApplied] = useState<number|null>(null);

  useEffect(()=>{
    let aborted = false;
    async function load(){
      try{
        setInflLoading(true); setInflError(null);
        const r = await fetch(`/api/inflacao?indice=${encodeURIComponent(inflationIndex)}&periodo=10y`);
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if(aborted) return;
        setAvg5y(j.media_5a ?? null);
        setAvg10y(j.media_10a ?? null);
      }catch(e:any){
        if(!aborted) setInflError(e?.message || "erro");
      }finally{
        if(!aborted) setInflLoading(false);
      }
    }
    load();
    return ()=>{ aborted = true; }
  }, [inflationIndex]);

  function annualFromSerie12m(serie:any[]): number | null {
    const arr = (serie || []).slice(-12).map((r:any) => Number(r.pct_mensal)).filter((v:number) => Number.isFinite(v));
    if (arr.length === 0) return null;
    const prod = arr.reduce((a:number,v:number)=> a * (1 + v/100), 1);
    return (Math.pow(prod, 12/arr.length) - 1) * 100;
  }

  async function applyFocusMedian(){
    try{
      setFocusLoading(true); setFocusError(null);
      if(inflationIndex!=="IPCA"){
        const ok = window.confirm("A mediana Focus (12m) é de IPCA. Aplicar mesmo assim?");
        if(!ok){ setFocusLoading(false); return; }
      }
      const r = await fetch("/api/focus?horizonte=12m");
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if(!j.ok || typeof j.annual!=="number") throw new Error(j.error||"sem dado");
      setInflationAnnual(Number(j.annual));
      setLastFocusApplied(Number(j.annual));
    }catch(e:any){ setFocusError(e?.message||"falha"); }
    finally{ setFocusLoading(false); }
  }

  return (
    <div style={{fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial"}}>
      <div style={{maxWidth:960, margin:"24px auto", padding:"0 16px"}}>
        <h1 style={{margin:"0 0 8px"}}>Calculadora de Aposentadoria</h1>
        <p style={{margin:"0 0 16px", color:"#475569"}}>Demo mínima funcionando (UI simplificada). As rotas <code>/api/inflacao</code> e <code>/api/focus</code> já estão ativas.</p>

        <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:8}}>
          <div role="tablist" aria-label="Modo de preços" style={{border:"1px solid #cbd5e1", borderRadius:8, overflow:"hidden"}}>
            <button onClick={()=>setModePrice("real")} style={{padding:"6px 10px", background:modePrice==="real"?"#0f172a":"#fff", color:modePrice==="real"?"#fff":"#334155", border:"none"}}>Real</button>
            <button onClick={()=>setModePrice("nominal")} style={{padding:"6px 10px", background:modePrice==="nominal"?"#0f172a":"#fff", color:modePrice==="nominal"?"#fff":"#334155", borderLeft:"1px solid #cbd5e1", borderRight:"none", borderTop:"none", borderBottom:"none"}}>Nominal</button>
          </div>

          <div style={{display:"flex", alignItems:"center", gap:6, fontSize:12}}>
            <span style={{color:"#64748b"}}>{inflationIndex} anual</span>
            <input type="number" step={0.1} value={inflationAnnual} onChange={e=>setInflationAnnual(Number(e.target.value)||0)} style={{height:28, width:80, border:"1px solid #cbd5e1", borderRadius:6, padding:"0 8px", textAlign:"right"}} />
            <span style={{color:"#64748b"}}>%</span>
            <select value={inflationIndex} onChange={e=>setInflationIndex(e.target.value as any)} style={{height:28, border:"1px solid #cbd5e1", borderRadius:6, padding:"0 8px"}}>
              <option>IPCA</option>
              <option>IPCA-15</option>
              <option>IGP-M</option>
            </select>
            <span style={{fontSize:11, color:"#64748b"}} title="Fórmula: nominal = (1+real)·(1+inflação) − 1">(ex.: 4% real → depende da inflação)</span>
          </div>

          <button onClick={applyFocusMedian} title="Focus: expectativa do mercado (IPCA 12m)."
                  style={{height:28, padding:"0 8px", border:"1px solid #cbd5e1", borderRadius:6, background:"#fff"}}>
            {focusLoading ? "Carregando…" : "Usar mediana Focus (12m)"}
          </button>

          <button title="Realizado: inflação observada (12m)."
                  style={{height:28, padding:"0 8px", border:"1px solid #cbd5e1", borderRadius:6, background:"#fff"}}
                  onClick={async ()=>{
                    try{
                      setRealizedLoading(true); setRealizedError(null);
                      const r = await fetch(`/api/inflacao?indice=${encodeURIComponent(inflationIndex)}&periodo=12m`);
                      if(!r.ok) throw new Error(`HTTP ${r.status}`);
                      const j = await r.json();
                      const annual = annualFromSerie12m(j?.serie||[]);
                      if(annual==null) throw new Error("sem dado");
                      setInflationAnnual(Number(annual));
                      setLastRealizedApplied(Number(annual));
                    }catch(e:any){ setRealizedError(e?.message||"falha"); }
                    finally{ setRealizedLoading(false); }
                  }}>
            {realizedLoading ? "Carregando…" : "Usar média 12m (realizado)"}
          </button>
        </div>

        {lastFocusApplied!=null && (
          <div style={{fontSize:11, color:"#475569", marginTop:4}}>Mediana Focus aplicada: <strong>{formatNumber(lastFocusApplied,2)}% a.a.</strong></div>
        )}
        {lastRealizedApplied!=null && (
          <div style={{fontSize:11, color:"#475569", marginTop:4}}>Média 12m (realizado) aplicada: <strong>{formatNumber(lastRealizedApplied,2)}% a.a.</strong></div>
        )}
        {realizedError && (<div style={{fontSize:11, color:"#92400e", marginTop:4}}>Falha ao buscar realizado (12m): {realizedError}</div>)}
        {focusError && (<div style={{fontSize:11, color:"#92400e", marginTop:4}}>Falha ao buscar mediana Focus: {focusError}</div>)}

        <div style={{fontSize:11, color:"#475569", marginTop:8}}>
          <span title="Focus: expectativas coletadas pelo BCB. Realizado: inflação observada 12m.">
            <strong>Focus</strong> = expectativa do mercado • <strong>Realizado</strong> = inflação observada (12m)
          </span>
          <span title="Média 12m = geométrica anualizada: ((∏(1+m_i))^(12/n)-1)×100." style={{marginLeft:8}}>(média 12m = geométrica anualizada)</span>
        </div>

        <hr style={{margin:"16px 0"}}/>

        <p style={{fontSize:13, color:"#334155"}}>A UI da calculadora completa pode ser plugada aqui (esta é uma versão mínima só para garantir o deploy e testar APIs).</p>
      </div>
    </div>
  );
}
