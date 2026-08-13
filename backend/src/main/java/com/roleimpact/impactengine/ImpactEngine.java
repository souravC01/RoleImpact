package com.roleimpact.impactengine;

import com.roleimpact.catalog.snapshot.OrganizationSnapshot;

public interface ImpactEngine {

	ImpactResult analyze(OrganizationSnapshot baseline, SimulationChange change);
}
