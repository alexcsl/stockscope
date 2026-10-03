"use client";
import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, type UTCTimestamp } from "lightweight-charts";
import type { Candle, CandleInterval } from "@/lib/candle-history";
export default function CandleCanvas({ candles, interval, view = "candles" }: { candles: Candle[]; interval: CandleInterval; view?: "candles" | "line" }) {
  const container = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, { autoSize: true, height: 340, layout: { background: { type: ColorType.Solid, color: "#0b100e" }, textColor: "#b5c4bc", fontSize: 12, attributionLogo: true }, grid: { vertLines: { color: "#1c2922" }, horzLines: { color: "#1c2922" } }, timeScale: { timeVisible: true, secondsVisible: false }, rightPriceScale: { borderColor: "#2c3c32" } });
    const step = interval === "15m" ? 900 : interval === "1h" ? 3600 : 86400;
    const data: ({ time: UTCTimestamp } | (Candle & { time: UTCTimestamp }))[] = [];
    for (let index = 0; index < candles.length; index++) {
      if (index) for (let time = candles[index - 1].time + step; time < candles[index].time && data.length < 3200; time += step) data.push({ time: time as UTCTimestamp });
      data.push({ ...candles[index], time: candles[index].time as UTCTimestamp });
    }
    const series = view === "line"
      ? chart.addSeries(LineSeries, { color: "#bbeb79", lineWidth: 2, lineType: 0, priceFormat: { type: "price", precision: 4, minMove: 0.0001 } })
      : chart.addSeries(CandlestickSeries, { upColor: "#62d6aa", downColor: "#ef8890", wickUpColor: "#62d6aa", wickDownColor: "#ef8890", borderVisible: false, priceFormat: { type: "price", precision: 4, minMove: 0.0001 } });
    if (view === "line") {
      series.setData(data.map((bar) => "close" in bar ? { time: bar.time, value: bar.close } : { time: bar.time }));
    } else series.setData(data);
    series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" } });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(candles.map((bar) => ({ time: bar.time as UTCTimestamp, value: bar.volume, color: bar.close >= bar.open ? "#285b49" : "#623740" })));
    chart.subscribeCrosshairMove((event) => { setHover(candles.find((bar) => bar.time === Number(event.time)) || null); });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, interval, view]);
  const bar = candles.find((item) => item.time === hover?.time) || candles.at(-1);
  return <><div className="candle-ohlc" aria-hidden="true">{bar ? <><span>{new Date(bar.time * 1000).toISOString()}</span><span>O {bar.open.toFixed(4)}</span><span>H {bar.high.toFixed(4)}</span><span>L {bar.low.toFixed(4)}</span><span>C {bar.close.toFixed(4)}</span><span>Vol ${bar.volume.toLocaleString()}</span></> : null}</div><div ref={container} className="candle-canvas" role="img" aria-label={`Token price ${view === "line" ? "line chart" : "candlesticks"} and USD trading volume. Candle data is available in the source details table.`} /></>;
}
