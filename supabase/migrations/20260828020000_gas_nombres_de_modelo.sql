-- Gas · los autos pasan a llamarse por su modelo.
--
-- Solo renombra los que todavía tienen el nombre genérico con el que se
-- crearon: si el usuario ya los renombró a mano, no se le pisa la elección.
update gas_autos set nombre = 'JAC J4'        where color = 'rojo'  and nombre = 'Auto rojo';
update gas_autos set nombre = 'Grand Vitara'  where color = 'plomo' and nombre = 'Auto plomo';
