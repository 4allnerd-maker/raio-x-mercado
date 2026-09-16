// Conversão de fuso horário pro site. Os horários da fonte (football-data.co.uk)
// vêm no horário local do Reino Unido (GMT/BST) pra todas as ligas, inclusive as
// extras (Brasileirão etc — dá pra confirmar isso pelos horários batendo com
// os horários noturnos típicos do futebol brasileiro quando convertidos).
var RaioXTz = (function(){
  var TZ_LIST = [
    { id: 'America/Sao_Paulo', label: 'Brasília (padrão)' },
    { id: 'America/Manaus', label: 'Amazonas / Mato Grosso (UTC-4)' },
    { id: 'America/Rio_Branco', label: 'Acre (UTC-5)' },
    { id: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)' },
    { id: 'Europe/London', label: 'Horário original da fonte (Reino Unido)' }
  ];
  var STORAGE_KEY = 'raiox_tz';

  function getSelected(){
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v && TZ_LIST.some(function(z){ return z.id === v; }) ? v : 'America/Sao_Paulo';
    } catch(e){ return 'America/Sao_Paulo'; }
  }
  function setSelected(tz){
    try { localStorage.setItem(STORAGE_KEY, tz); } catch(e){}
  }

  // Converte data+hora "como publicada pela fonte" (Europe/London) pra um Date UTC real.
  function sourceToUtc(dateStr, timeStr){
    if(!timeStr) return null;
    var guess = new Date(dateStr + 'T' + timeStr + ':00Z');
    if(isNaN(guess.getTime())) return null;
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone:'Europe/London', hour12:false,
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
    });
    var parts = {};
    fmt.formatToParts(guess).forEach(function(p){ parts[p.type] = p.value; });
    var hour = parts.hour === '24' ? '00' : parts.hour;
    var londonAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute);
    var diff = londonAsUtc - guess.getTime();
    return new Date(guess.getTime() - diff);
  }

  function formatInTz(utcDate, tz){
    if(!utcDate) return { date:'-', time:'-', weekday:'', iso:null, hour:null };
    var fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:false, weekday:'long'
    });
    var parts = {};
    fmt.formatToParts(utcDate).forEach(function(p){ parts[p.type] = p.value; });
    var hour = parts.hour === '24' ? '00' : parts.hour;
    return {
      date: parts.day + '/' + parts.month,
      time: hour + ':' + parts.minute,
      weekday: parts.weekday,
      iso: parts.year + '-' + parts.month + '-' + parts.day,
      hour: +hour
    };
  }

  // Atalho: dado {d,t} cru da fonte, devolve já formatado no fuso selecionado.
  function convertFixture(dateStr, timeStr, tz){
    var utc = sourceToUtc(dateStr, timeStr);
    return formatInTz(utc, tz || getSelected());
  }

  function renderPicker(containerEl, onChange){
    var cur = getSelected();
    containerEl.innerHTML = '<select id="tz-picker" aria-label="Fuso horário">' + TZ_LIST.map(function(z){
      return '<option value="'+z.id+'"'+(z.id===cur?' selected':'')+'>'+z.label+'</option>';
    }).join('') + '</select>';
    var sel = containerEl.querySelector('#tz-picker');
    sel.addEventListener('change', function(e){
      setSelected(e.target.value);
      if(onChange) onChange(e.target.value);
    });
  }

  return {
    TZ_LIST: TZ_LIST,
    getSelected: getSelected,
    setSelected: setSelected,
    sourceToUtc: sourceToUtc,
    formatInTz: formatInTz,
    convertFixture: convertFixture,
    renderPicker: renderPicker
  };
})();
