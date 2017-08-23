function OpenAdViewability() {

    /*
     This implementation is according to MRC Viewability guidelines -
     http://mediaratingcouncil.org/081815%20Viewable%20Ad%20Impression%20Guideline_v2.0_Final.pdf
     */

    var geometryViewabilityCalculator = new OAVGeometryViewabilityCalculator();

    var check = {
        percentObscured: 0,
        percentViewable: 0,
        acceptedViewablePercentage: 50,
        viewabilityStatus: false,
        duration: 0
    };

    this.DEBUG_MODE = false;

    this.checkViewability = function (ad, statusCallback) {
        var count = 0;
        var that = this;
        var timer = setInterval(function () {
            if (checkViewable(ad)) {
                count++;
            } else {
                count = 0;
            }
            check.duration = count * 100;
            if (count >= 9) {
                check.viewabilityStatus = true;
                if(!that.DEBUG_MODE)
                    clearInterval(timer);
            }
            statusCallback(check);
        }, 100);
    };

    var checkViewable = function (ad) {
        var adRect = ad.getBoundingClientRect();
        var totalArea = adRect.width * adRect.height;
        // According to MRC standards, larget ad unit size have only 30% viewable requirements
        if (totalArea >= 242500) {
            check.acceptedViewablePercentage = 30;
        }

        if (checkCssInvisibility(ad)) {
            return false;
        }

        if (checkDomObscuring(ad)) {
            return false;
        }

        checkGeometry(ad);

        if (check.percentViewable && check.percentViewable < check.acceptedViewablePercentage) {
            return false;
        }

        return check.percentViewable;
    };

    /**
     * Performs the geometry technique to determine viewability. First gathers
     * information on the viewport and on the ad. Then compares the two to
     * determine what percentage, if any, of the ad is within the bounds
     * of the viewport.
     * @param {Element} ad The HTML Element to measure
     */
    var checkGeometry = function (ad) {
        check.percentObscured = check.percentObscured || 0;
        var viewabilityResult = geometryViewabilityCalculator.getViewabilityState(ad, window);
        if (!viewabilityResult.error) {
            check.percentViewable = viewabilityResult.percentViewable - check.percentObscured;
        }
        return viewabilityResult;
    };

    /**
     * Checks if the ad is made invisible by css attribute 'visibility:hidden'
     * or 'display:none'.
     * Is so, viewability at the time of this check is 'not viewable' and no further check
     * is required.
     * These properties are inherited, so no need to parse up the DOM hierarchy.
     * If the ad is in an iframe inheritance is restricted to elements within
     * the DOM of the iframe document
     * @param {Element} ad The HTML Element to measure
     */
    var checkCssInvisibility = function (ad) {
        var style = window.getComputedStyle(ad, null);
        var visibility = style.getPropertyValue('visibility');
        var display = style.getPropertyValue('display');
        return 'hidden' === visibility || 'none' === display;
    };

    /**
     * Checks if the ad is more then 50% obscured by another dom element.
     * Is so, viewability at the time of this check is 'not viewable' and no further check
     * is required.
     * If the ad is in an iframe this check is restricted to elements within
     * the DOM of the iframe document
     * @param {Element} ad The HTML Element to measure
     */
    var checkDomObscuring = function (ad) {
        var adRect = ad.getBoundingClientRect(),
            offset = 12,
            xLeft = adRect.left + offset,
            xRight = adRect.right - offset,
            yTop = Math.max(0, adRect.top + offset),
            yBottom = adRect.bottom - offset,
            xCenter = Math.floor(adRect.left + adRect.width / 2),
            yCenter = Math.floor(adRect.top + adRect.height / 2),
            testPoints = [
                { x: xLeft, y: yTop },
                { x: xCenter, y: yTop },
                { x: xRight, y: yTop },
                { x: xLeft, y: yCenter },
                { x: xCenter, y: yCenter },
                { x: xRight, y: yCenter },
                { x: xLeft, y: yBottom },
                { x: xCenter, y: yBottom },
                { x: xRight, y: yBottom }
            ];

        for (var p in testPoints) {
            if (testPoints[p] && testPoints[p].x >= 0 && testPoints[p].y >= 0) {
                elem = document.elementFromPoint(testPoints[p].x, testPoints[p].y);

                if (elem !== null && elem !== ad && !ad.contains(elem)) {
                    overlappingArea = overlapping(adRect, elem.getBoundingClientRect());
                    if (overlappingArea > 0) {
                        check.percentObscured = 100 * overlapping(adRect, elem.getBoundingClientRect());
                        if (check.percentObscured > check.acceptedViewablePercentage) {
                            check.percentViewable = 100 - check.percentObscured;
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    };

    var overlapping = function(adRect, elem ){
        var adArea = adRect.width * adRect.height;
        var x_overlap = Math.max(0, Math.min(adRect.right, elem.right) - Math.max(adRect.left, elem.left));
        var y_overlap = Math.max(0, Math.min(adRect.bottom, elem.bottom) - Math.max(adRect.top, elem.top));
        return (x_overlap * y_overlap) / adArea;
    }
}

function OAVGeometryViewabilityCalculator() {

    this.getViewabilityState = function (element, contextWindow) {
        var minViewPortSize = getMinViewPortSize(),
            viewablePercentage;
        if (minViewPortSize.area === Infinity) {
            return { error: 'Failed to determine viewport' };
        }
        var assetRect = element.getBoundingClientRect();
        var adArea = assetRect.width * assetRect.height;
        if ((minViewPortSize.area / adArea) < 0.5) {
            // no position testing required if viewport is less than half the area of the ad
            viewablePercentage = Math.floor(100 * minViewPortSize.area / adArea);
        } else {
            var viewPortSize = getViewPortSize(window.top),
                visibleAssetSize = getAssetVisibleDimension(element, contextWindow);
            //var viewablePercentage = getAssetViewablePercentage(assetSize, viewPortSize);
            //Height within viewport:
            if (visibleAssetSize.bottom > viewPortSize.height) {
                //Partially below the bottom
                visibleAssetSize.height -= (visibleAssetSize.bottom - viewPortSize.height);
            }
            if (visibleAssetSize.top < 0) {
                //Partially above the top
                visibleAssetSize.height += visibleAssetSize.top;
            }
            if (visibleAssetSize.left < 0) {
                visibleAssetSize.width += visibleAssetSize.left;
            }
            if (visibleAssetSize.right > viewPortSize.width) {
                visibleAssetSize.width -= (visibleAssetSize.right - viewPortSize.width);
            }
            // Viewable percentage is the portion of the ad that's visible divided by the size of the ad
            viewablePercentage = Math.floor(100 * (visibleAssetSize.width * visibleAssetSize.height) / adArea);
        }
        /*
         //Get ad dimensions:
         var assetRect = element.getBoundingClientRect();
         */
        return {
            clientWidth: viewPortSize.width,
            clientHeight: viewPortSize.height,
            objTop: assetRect.top,
            objBottom: assetRect.bottom,
            objLeft: assetRect.left,
            objRight: assetRect.right,
            percentViewable: viewablePercentage
        };
    };

    ///////////////////////////////////////////////////////////////////////////
    // PRIVATE FUNCTIONS
    ///////////////////////////////////////////////////////////////////////////

    // Check nested iframes
    var getMinViewPortSize = function () {
        var minViewPortSize = getViewPortSize(window),
            minViewPortArea = minViewPortSize.area,
            currentWindow = window;

        while (currentWindow !== window.top) {
            currentWindow = currentWindow.parent;
            var viewPortSize = getViewPortSize(currentWindow);
            if (viewPortSize.area < minViewPortArea) {
                minViewPortArea = viewPortSize.area;
                minViewPortSize = viewPortSize;
            }
        }
        return minViewPortSize;
    };

    /**
     * Get the viewport size by taking the smallest dimensions
     */
    var getViewPortSize = function (contextWindow) {
        var viewPortSize = {
            width: Infinity,
            height: Infinity,
            area: Infinity
        };

        //document.body  - Handling case where viewport is represented by documentBody
        //.width
        if (!isNaN(contextWindow.document.body.clientWidth) && contextWindow.document.body.clientWidth > 0) {
            viewPortSize.width = contextWindow.document.body.clientWidth;
        }
        //.height
        if (!isNaN(contextWindow.document.body.clientHeight) && contextWindow.document.body.clientHeight > 0) {
            viewPortSize.height = contextWindow.document.body.clientHeight;
        }
        //document.documentElement - Handling case where viewport is represented by documentElement
        //.width
        if (!!contextWindow.document.documentElement && !!contextWindow.document.documentElement.clientWidth && !isNaN(contextWindow.document.documentElement.clientWidth)) {
            viewPortSize.width = contextWindow.document.documentElement.clientWidth;
        }
        //.height
        if (!!contextWindow.document.documentElement && !!contextWindow.document.documentElement.clientHeight && !isNaN(contextWindow.document.documentElement.clientHeight)) {
            viewPortSize.height = contextWindow.document.documentElement.clientHeight;
        }
        //window.innerWidth/Height - Handling case where viewport is represented by window.innerH/W
        //.innerWidth
        if (!!contextWindow.innerWidth && !isNaN(contextWindow.innerWidth)) {
            viewPortSize.width = Math.min(viewPortSize.width, contextWindow.innerWidth);
        }
        //.innerHeight
        if (!!contextWindow.innerHeight && !isNaN(contextWindow.innerHeight)) {
            viewPortSize.height = Math.min(viewPortSize.height, contextWindow.innerHeight);
        }
        viewPortSize.area = viewPortSize.height * viewPortSize.width;
        return viewPortSize;
    };

    /**
     * Recursive function that return the asset (element) visible dimension
     * @param {element} The element to get his visible dimension
     * @param {contextWindow} The relative window
     */
    var getAssetVisibleDimension = function (element, contextWindow) {
        var currWindow = contextWindow;
        //Set parent window for recursive call
        var parentWindow = contextWindow.parent;
        var resultDimension = { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };

        if (element) {
            var elementRect = getPositionRelativeToViewPort(element, contextWindow);
            elementRect.width = elementRect.right - elementRect.left;
            elementRect.height = elementRect.bottom - elementRect.top;
            resultDimension = elementRect;
            //Calculate the relative element dimension if we clime to a parent window
            if (currWindow !== parentWindow) {
                //Recursive call to get the relative element dimension from the parent window
                var parentDimension = getAssetVisibleDimension(currWindow.frameElement, parentWindow);
                //The asset is partially below the parent window (asset bottom is below the visible window)
                if (parentDimension.bottom < resultDimension.bottom) {
                    if (parentDimension.bottom < resultDimension.top) {
                        //The entire asset is below the parent window
                        resultDimension.top = parentDimension.bottom;
                    }
                    //Set the asset bottom to be the visible part
                    resultDimension.bottom = parentDimension.bottom;
                }
                //The asset is partially right to the parent window
                if (parentDimension.right < resultDimension.right) {
                    if (parentDimension.right < resultDimension.left) {
                        //The entire asset is to the right of the parent window
                        resultDimension.left = parentDimension.right;
                    }
                    //Set the asset right to be the visible
                    resultDimension.right = parentDimension.right;
                }

                resultDimension.width = resultDimension.right - resultDimension.left;
                resultDimension.height = resultDimension.bottom - resultDimension.top;
            }
        }
        return resultDimension;
    };

    var getPositionRelativeToViewPort = function (element, contextWindow) {
        var currWindow = contextWindow;
        var parentWindow = contextWindow.parent;
        var resultPosition = { left: 0, right: 0, top: 0, bottom: 0 };

        if (element) {
            var elementRect = element.getBoundingClientRect();
            if (currWindow !== parentWindow) {
                resultPosition = getPositionRelativeToViewPort(currWindow.frameElement, parentWindow);
            }
            resultPosition = {
                left: elementRect.left + resultPosition.left,
                right: elementRect.right + resultPosition.left,
                top: elementRect.top + resultPosition.top,
                bottom: elementRect.bottom + resultPosition.top
            };
        }
        return resultPosition;
    };

    /**
     * Calculate asset viewable percentage given the asset size and the viewport
     * @param {effectiveAssetRect} the asset viewable rect; effectiveAssetRect = {left :, top :,bottom:,right:,}
     * @param {viewPortSize} the browser viewport size;
     */
    var getAssetViewablePercentage = function (effectiveAssetRect, viewPortSize) {
        // holds the asset viewable surface
        var assetVisibleHeight = 0, assetVisibleWidth = 0;
        var asset = {
            width: effectiveAssetRect.right - effectiveAssetRect.left,
            height: effectiveAssetRect.bottom - effectiveAssetRect.top
        };

        // Ad is 100% out off-view
        if (effectiveAssetRect.bottom < 0 // the entire asset is above the viewport
            || effectiveAssetRect.right < 0 // the entire asset is left to the viewport
            || effectiveAssetRect.top > viewPortSize.height // the entire asset bellow the viewport
            || effectiveAssetRect.left > viewPortSize.width // the entire asset is right to the viewport
            || asset.width <= 0 // the asset width is zero
            || asset.height <= 0)  // the asset height is zero
        {
            return 0;
        }
        // ---- Handle asset visible height ----
        // the asset is partially above the viewport
        if (effectiveAssetRect.top < 0) {
            // take the visible part
            assetVisibleHeight = asset.height + effectiveAssetRect.top;
            //if the asset height is larger then the viewport height, set the asset height to be the viewport height
            if (assetVisibleHeight > viewPortSize.height) {
                assetVisibleHeight = viewPortSize.height;
            }
        }
        // the asset is partially below the viewport
        else if (effectiveAssetRect.top + asset.height > viewPortSize.height) {
            // take the visible part
            assetVisibleHeight = viewPortSize.height - effectiveAssetRect.top;
        }
        // the asset is in the viewport
        else {
            assetVisibleHeight = asset.height;
        }
        // ---- Handle asset visible width ----
        // the asset is partially left to the viewport
        if (effectiveAssetRect.left < 0) {
            // take the visible part
            assetVisibleWidth = asset.width + effectiveAssetRect.left;
            //if the asset width is larger then the viewport width, set the asset width to be the viewport width
            if (assetVisibleWidth > viewPortSize.width) {
                assetVisibleWidth = viewPortSize.width;
            }
        }
        // the asset is partially right to the viewport
        else if (effectiveAssetRect.left + asset.width > viewPortSize.width) {
            // take the visible part
            assetVisibleWidth = viewPortSize.width - effectiveAssetRect.left;
        }
        // the asset is in the viewport
        else {
            assetVisibleWidth = asset.width;
        }
        // Divied the visible asset area by the full asset area to the the visible percentage
        return Math.round((((assetVisibleWidth * assetVisibleHeight)) / (asset.width * asset.height)) * 100);
    };
}
