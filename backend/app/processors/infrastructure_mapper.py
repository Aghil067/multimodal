"""
Infrastructure Mapper.
Maps infrastructure locations to spatial regions and provides spatial indexing
for fast proximity queries between infrastructure and other data sources.
"""
import math
import logging
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class InfrastructureMapper:
    """
    Manages infrastructure locations with spatial indexing for efficient
    proximity queries.
    """

    def __init__(self):
        self.locations: List[Dict] = []
        self.grid: Dict[Tuple[int, int], List[Dict]] = defaultdict(list)
        self.grid_size = 0.01  # ~1km grid cells

    def load_locations(self, locations: List[Dict]):
        """Load infrastructure locations and build spatial index."""
        self.locations = locations
        self.grid.clear()

        for loc in locations:
            lat = loc.get("latitude")
            lng = loc.get("longitude")
            if lat and lng:
                cell = self._get_grid_cell(lat, lng)
                self.grid[cell].append(loc)

        logger.info(
            f"Loaded {len(locations)} infrastructure locations "
            f"into {len(self.grid)} grid cells"
        )

    def _get_grid_cell(self, lat: float, lng: float) -> Tuple[int, int]:
        """Convert coordinates to grid cell index."""
        return (int(lat / self.grid_size), int(lng / self.grid_size))

    def find_nearby(
        self,
        lat: float,
        lng: float,
        radius_km: float = 2.0,
        infra_type: str = None
    ) -> List[Dict]:
        """
        Find infrastructure locations near a given point.
        Uses spatial grid for efficient lookup.
        """
        cell = self._get_grid_cell(lat, lng)
        # Check neighboring cells too
        search_radius = max(1, int(radius_km / (self.grid_size * 111)))

        candidates = []
        for di in range(-search_radius, search_radius + 1):
            for dj in range(-search_radius, search_radius + 1):
                neighbor = (cell[0] + di, cell[1] + dj)
                candidates.extend(self.grid.get(neighbor, []))

        results = []
        for loc in candidates:
            loc_lat = loc.get("latitude")
            loc_lng = loc.get("longitude")
            if not loc_lat or not loc_lng:
                continue

            if infra_type and loc.get("type") != infra_type:
                continue

            distance = haversine_distance(lat, lng, loc_lat, loc_lng)
            if distance <= radius_km:
                results.append({
                    **loc,
                    "distance_km": round(distance, 2)
                })

        results.sort(key=lambda x: x["distance_km"])
        return results

    def get_by_type(self, infra_type: str) -> List[Dict]:
        """Get all infrastructure of a specific type."""
        return [loc for loc in self.locations if loc.get("type") == infra_type]

    def get_type_stats(self) -> Dict[str, int]:
        """Get count of each infrastructure type."""
        stats = defaultdict(int)
        for loc in self.locations:
            stats[loc.get("type", "unknown")] += 1
        return dict(stats)

    def create_cluster_summary(
        self,
        cluster_radius_km: float = 2.0
    ) -> List[Dict]:
        """
        Create clusters of infrastructure for map visualization.
        Groups nearby locations of the same type.
        """
        if not self.locations:
            return []

        visited = set()
        clusters = []

        for i, loc in enumerate(self.locations):
            if i in visited:
                continue

            cluster_locs = [loc]
            visited.add(i)

            for j, other in enumerate(self.locations):
                if j in visited:
                    continue
                if loc.get("type") != other.get("type"):
                    continue

                dist = haversine_distance(
                    loc["latitude"], loc["longitude"],
                    other["latitude"], other["longitude"]
                )

                if dist <= cluster_radius_km:
                    cluster_locs.append(other)
                    visited.add(j)

            # Compute cluster center
            avg_lat = sum(l["latitude"] for l in cluster_locs) / len(cluster_locs)
            avg_lng = sum(l["longitude"] for l in cluster_locs) / len(cluster_locs)

            clusters.append({
                "type": loc.get("type"),
                "count": len(cluster_locs),
                "latitude": round(avg_lat, 6),
                "longitude": round(avg_lng, 6),
                "locations": cluster_locs[:10],  # Limit for API response
                "names": [l.get("name", "Unknown") for l in cluster_locs[:10]]
            })

        return clusters

    def map_disruption_to_infrastructure(
        self,
        disruption_lat: float,
        disruption_lng: float,
        radius_km: float = 1.5
    ) -> Dict[str, List[Dict]]:
        """
        For a given disruption location, find all nearby infrastructure
        categorized by type.
        """
        nearby = self.find_nearby(disruption_lat, disruption_lng, radius_km)

        by_type = defaultdict(list)
        for loc in nearby:
            by_type[loc.get("type", "other")].append(loc)

        return dict(by_type)


# Singleton
_mapper: Optional[InfrastructureMapper] = None


def get_infrastructure_mapper() -> InfrastructureMapper:
    """Get or create the infrastructure mapper singleton."""
    global _mapper
    if _mapper is None:
        _mapper = InfrastructureMapper()
    return _mapper
