import { describe, expect, it } from "vitest";
import { AMENITY_BIT, amenityScore, countedAmenities, setAmenitySelection } from "@/lib/radar";

describe("amenity score follows the selected amenities", () => {
  const shopAndBakery = AMENITY_BIT.shop | AMENITY_BIT.bakery;
  it("scores only the ticked amenities", () => {
    expect(amenityScore(shopAndBakery, AMENITY_BIT.shop | AMENITY_BIT.doc)).toBe(50);
    expect(amenityScore(shopAndBakery, AMENITY_BIT.bakery)).toBe(100);
    expect(amenityScore(shopAndBakery, AMENITY_BIT.pt)).toBe(0);
  });
  it("counts all four when nothing is ticked", () => {
    setAmenitySelection({});
    expect(countedAmenities()).toEqual(["shop", "doc", "pt", "bakery"]);
    expect(amenityScore(shopAndBakery)).toBe(50);
    setAmenitySelection({ doc: true });
    expect(countedAmenities()).toEqual(["doc"]);
  });
});
