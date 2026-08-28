'use client'

import { createMiniAppRouter } from '@/components/mini-app-router'

/**
 * El router interno de Finanzas. La mecánica vive en components/mini-app-router
 * y es la misma para todas las mini-apps; acá solo se fija el base path y se le
 * ponen los nombres con los que la app ya llamaba a estas cosas.
 */
const router = createMiniAppRouter('/finanzas')

export const FzRouterProvider = router.Provider
export const FzLink = router.Link
export const useFzPath = router.usePath
export const useFzRouter = router.useNav

/** Los filtros que viajan por la URL — hoy los usa Movimientos, para poder
    llegar desde Presupuesto ya filtrado por categoría y mes. */
export function useFzQuery() {
  return router.useNav().query
}
