-- Gas · una nota opcional en el movimiento.
--
-- "Fui al aeropuerto", "llevé a mamá al médico": el para qué del viaje, que el
-- kilometraje solo no cuenta. Se escribe desde el resumen apenas se cierra el
-- viaje, o después desde el historial.
--
-- La columna va en la tabla entera y no solo para viajes porque es una sola
-- tabla; hoy la interfaz la muestra únicamente en los viajes.
alter table gas_movimientos add column if not exists nota text;

-- Un tope para que no se cuele un texto enorme. 200 alcanza de sobra para una
-- línea, que es lo que la fila del historial puede mostrar.
alter table gas_movimientos drop constraint if exists gas_mov_nota_largo;
alter table gas_movimientos add constraint gas_mov_nota_largo
  check (nota is null or char_length(nota) <= 200);
