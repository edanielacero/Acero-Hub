import type { ColorAuto } from '@/lib/gas/types'

/**
 * La foto del auto en la tarjeta.
 *
 * Las dos tarjetas tienen que medir IGUAL, y eso no salía solo: cada foto viene
 * con su propia proporción y su propio margen vacío. La del J4 traía 24px de
 * aire arriba —el 43% del archivo era transparente—, así que su marco era más
 * alto que el de la Vitara y la tarjeta del J4 quedaba más larga, con el auto
 * plomo viéndose chico al lado.
 *
 * Se arregló en dos pasos:
 *   1. La foto del J4 se recortó a su contenido real (291×127). La de la Vitara
 *      ya venía ajustada — apenas 1,6% de margen— y se dejó como estaba.
 *   2. La caja tiene una PROPORCIÓN fija, así que las dos miden lo mismo y
 *      acompañan el ancho de la tarjeta. `object-contain` evita deformar.
 *
 * Los autos van apoyados abajo (`items-end`): las ruedas de los dos quedan
 * sobre la misma línea de piso, y la SUV se ve más alta que el sedán, que es
 * como son en la calle.
 */

const FOTOS: Record<ColorAuto, { src: string; ancho: number; alto: number; alt: string }> = {
  rojo:  { src: '/gas/j4.png',      ancho: 291, alto: 127, alt: 'JAC J4' },
  plomo: { src: '/gas/vitara.webp', ancho: 678, alto: 319, alt: 'Grand Vitara' },
}

export function AutoDibujo({ color, className = '' }: { color: ColorAuto; className?: string }) {
  const foto = FOTOS[color]

  return (
    <div className={`flex aspect-[2.15/1] w-full items-end justify-center ${className}`}>
      {/* `<img>` y no next/image a propósito: son dos archivos estáticos de
          menos de 80 KB que se muestran siempre, así que el optimizador no
          compra nada y sí agrega una request. */}
      <img
        src={foto.src}
        alt={foto.alt}
        width={foto.ancho}
        height={foto.alto}
        className="max-h-full w-full object-contain object-bottom"
      />
    </div>
  )
}
