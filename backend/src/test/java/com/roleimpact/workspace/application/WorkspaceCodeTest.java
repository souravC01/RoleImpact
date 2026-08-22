package com.roleimpact.workspace.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;

import org.junit.jupiter.api.Test;

class WorkspaceCodeTest {

	@Test
	void normalizesTypedCodesWithOrWithoutTheHyphen() {
		assertThat(WorkspaceCode.normalize(" nsm-7k4p9d ")).isEqualTo("NSM-7K4P9D");
		assertThat(WorkspaceCode.normalize("nsm7k4p9d")).isEqualTo("NSM-7K4P9D");
	}

	@Test
	void rejectsMalformedOrAmbiguousCodes() {
		assertThat(WorkspaceCode.normalize("NSM-7K4P0D")).isNull();
		assertThat(WorkspaceCode.normalize("not-a-code")).isNull();
	}

	@Test
	void generatesANamePrefixAndAllowedRandomSuffix() {
		var code = new WorkspaceCode(new SecureRandom()).generate("Northstar Medical Supplies");

		assertThat(code).matches("NMS-[A-HJ-NP-Z2-9]{6}");
	}
}
