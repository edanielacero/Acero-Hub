'use client'

import { createMiniAppRouter } from '@/components/mini-app-router'

/**
 * El router interno de Trading Journal. La mecánica vive en
 * components/mini-app-router y es la misma para todas las mini-apps; acá solo se
 * fija el base path.
 */
const router = createMiniAppRouter('/trading-journal')

export const TjRouterProvider = router.Provider
export const TjLink = router.Link
export const useTjPath = router.usePath
export const useTjRouter = router.useNav
