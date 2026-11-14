// LicitaClima worker — orquestador de trabajos (ingesta, documentos, análisis, resúmenes).
// Los trabajos especializados viven en ./jobs (Fase C/D). Cola persistente en PostgreSQL (tabla jobs).
console.log('LicitaClima worker — arranca (trabajos en ./jobs, Fase C).');
