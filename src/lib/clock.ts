export function formatClock(ms: number): string {
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
}

export function greetingForHour(ms: number): string {
  const hour = new Date(ms).getHours();
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 18) return 'Добрый день';
  if (hour >= 18 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

export function scheduleMinuteTick(onTick: () => void): () => void {
  let timer = 0;

  const arm = () => {
    const delay = 60000 - (Date.now() % 60000) + 30;
    timer = window.setTimeout(() => {
      onTick();
      arm();
    }, delay);
  };

  arm();

  return () => {
    window.clearTimeout(timer);
  };
}
