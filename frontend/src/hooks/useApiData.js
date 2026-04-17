import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for API data fetching with loading/error states and auto-refresh.
 */
export function useApiData(fetchFn, params = [], refreshInterval = null) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetchFn(...params);
            setData(response.data);
            setLastUpdated(new Date());
        } catch (err) {
            setError(err.message || 'Failed to fetch data');
            console.error('API fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [fetchFn, params]);

    useEffect(() => {
        fetchData();

        if (refreshInterval) {
            const interval = setInterval(fetchData, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [fetchData, refreshInterval]);

    return { data, loading, error, lastUpdated, refetch: fetchData };
}

/**
 * Hook for map viewport state.
 */
export function useMapViewport(initialCenter = [41.8781, -87.6298], initialZoom = 11) {
    const [center, setCenter] = useState(initialCenter);
    const [zoom, setZoom] = useState(initialZoom);

    const flyTo = useCallback((lat, lng, zoomLevel = 14) => {
        setCenter([lat, lng]);
        setZoom(zoomLevel);
    }, []);

    return { center, zoom, setCenter, setZoom, flyTo };
}
