package com.roleimpact.workspace.preview.api;

import com.roleimpact.impactengine.ImpactResult;

public record DraftMitigationPreviewResource(
		ImpactResult original,
		ImpactResult mitigation) {
}
