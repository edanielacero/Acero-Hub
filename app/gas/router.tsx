'use client'

import { createMiniAppRouter } from '@/components/mini-app-router'

/**
 * El router interno de Gas. La mecánica vive en components/mini-app-router y es
 * la misma para todas las mini-apps; acá solo se fija el base path.
 */
const router = createMiniAppRouter('/gas')

export const GasRouterProvider = router.Provider
export const GasLink = router.Link
export const useGasPath = router.usePath
export const useGasRouter = router.useNav
